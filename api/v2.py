"""FastAPI application – D'Tunes API v2 (yt-dlp Media Backend).

Byte-range audio proxy backed by yt-dlp. Streams audio directly
without storing files to disk. Supports HTTP Range requests (206 Partial Content).
"""
from __future__ import annotations

import asyncio
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import hashlib
import logging
import os
import re
import tempfile
import threading
import time
from typing import Any, Optional

import httpx
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, field_validator
import yt_dlp

logger = logging.getLogger("dtunes.api_v2")

try:
    from ytmusicapi import YTMusic
    _ytmusic_local = threading.local()

    def get_ytmusic() -> YTMusic:
        client = getattr(_ytmusic_local, "client", None)
        if client is None:
            client = YTMusic()
            _ytmusic_local.client = client
        return client
except Exception:
    get_ytmusic = None  # type: ignore

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Track(BaseModel):
    id: str
    title: str
    artist: str
    artwork: str
    duration: Optional[int] = None
    album: Optional[str] = None
    source: str = "youtube"

    @field_validator("id")
    @classmethod
    def id_must_be_nonempty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("track id must not be empty")
        return v.strip()


class SearchResponse(BaseModel):
    results: list[Track]
    query: str
    cached: bool = False


class HealthResponse(BaseModel):
    status: str
    ytdlp_version: Optional[str] = None
    ytdlp_available: bool


class ResolveResponse(BaseModel):
    id: str
    title: str
    artist: str
    artwork: str
    duration: Optional[int]
    stream_url: str
    ext: str
    cached: bool = False


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

class TTLCache:
    def __init__(self, max_size: int = 500) -> None:
        self._store: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._max_size = max(1, max_size)
        self._lock = asyncio.Lock()

    def _prune_expired(self, now: float) -> None:
        expired = [k for k, (_, exp) in self._store.items() if now > exp]
        for k in expired:
            self._store.pop(k, None)

    def _get_sync(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            self._store.pop(key, None)
            return None
        self._store.move_to_end(key)
        return value

    def _set_sync(self, key: str, value: Any, ttl: float) -> None:
        now = time.monotonic()
        if len(self._store) >= self._max_size:
            self._prune_expired(now)
        while len(self._store) >= self._max_size and key not in self._store:
            self._store.popitem(last=False)
        self._store[key] = (value, now + ttl)
        self._store.move_to_end(key)

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            return self._get_sync(key)

    async def set(self, key: str, value: Any, ttl: float) -> None:
        async with self._lock:
            self._set_sync(key, value, ttl)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._store.pop(key, None)


search_cache = TTLCache(max_size=500)
stream_cache = TTLCache(max_size=300)

SEARCH_TTL = 5 * 60       # 5 minutes
STREAM_TTL = 55 * 60      # 55 minutes
STREAM_CHUNK = 65_536     # 64 KiB chunks
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_BROWSE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")

def is_valid_video_id(video_id: str) -> bool:
    return bool(_VIDEO_ID_RE.match(video_id))

def is_valid_browse_id(browse_id: str) -> bool:
    return bool(_BROWSE_ID_RE.match(browse_id))


# ---------------------------------------------------------------------------
# yt-dlp Service Layer
# ---------------------------------------------------------------------------

YTDLP_COOKIES_FILE: Optional[str] = os.environ.get("YTDLP_COOKIES_FILE")
YTDLP_PROXY: Optional[str] = os.environ.get("YTDLP_PROXY")
YTDLP_FORMAT: str = os.environ.get("YTDLP_FORMAT", "bestaudio[ext=m4a]/bestaudio/best")
YTDLP_PLAYER_CLIENT: str = os.environ.get("YTDLP_PLAYER_CLIENT", "visionos,android,tv_samsung")

CLIENT_CANDIDATES: list[list[str]] = [
    ["visionos"],
    ["android"],
    ["tv_samsung"],
]

_cookies_lock = threading.Lock()
_cookies_hash: Optional[str] = None
_COOKIES_TMP_PATH = "/tmp/ytdlp_cookies.txt"


def _ensure_cookies_file(cookies_text: str) -> Optional[str]:
    global _cookies_hash
    digest = hashlib.sha256(cookies_text.encode("utf-8")).hexdigest()
    with _cookies_lock:
        if _cookies_hash == digest and os.path.exists(_COOKIES_TMP_PATH):
            return _COOKIES_TMP_PATH
        tmp_path: Optional[str] = None
        try:
            fd, tmp_path = tempfile.mkstemp(prefix="ytdlp_cookies_", dir="/tmp")
            os.chmod(tmp_path, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(cookies_text)
            os.replace(tmp_path, _COOKIES_TMP_PATH)
            _cookies_hash = digest
            return _COOKIES_TMP_PATH
        except Exception as exc:
            logger.warning("Failed to write cookies file: %s", exc)
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
            return None

def _base_opts(player_client: Optional[list[str]] = None) -> dict:
    clients = player_client or [c.strip() for c in YTDLP_PLAYER_CLIENT.split(",") if c.strip()]
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "cachedir": "/tmp/ytdlp-cache",
        "extractor_args": {
            "youtube": {
                "player_client": clients
            }
        },
    }
    if YTDLP_COOKIES_FILE and os.path.exists(YTDLP_COOKIES_FILE):
        opts["cookiefile"] = YTDLP_COOKIES_FILE
    cookies_text = os.environ.get("YTDLP_COOKIES")
    if cookies_text and not opts.get("cookiefile"):
        cookies_path = _ensure_cookies_file(cookies_text)
        if cookies_path:
            opts["cookiefile"] = cookies_path
    if YTDLP_PROXY:
        opts["proxy"] = YTDLP_PROXY
    return opts


def get_ytdlp_version() -> Optional[str]:
    try:
        return yt_dlp.version.__version__
    except Exception:
        return None


def _normalize_entry(entry: dict) -> Optional[Track]:
    video_id: str = entry.get("id", "")
    if not video_id or not is_valid_video_id(video_id):
        return None

    title: str = entry.get("title") or "Unknown"
    uploader: str = (
        entry.get("artist")
        or entry.get("creator")
        or entry.get("uploader")
        or "Unknown Artist"
    )
    duration: Optional[int] = entry.get("duration")
    thumbnails: list = entry.get("thumbnails") or []
    artwork: str = ""
    if thumbnails:
        for t in reversed(thumbnails):
            if isinstance(t, dict) and t.get("url"):
                artwork = t["url"]
                break
    if not artwork:
        artwork = entry.get("thumbnail") or ""

    return Track(
        id=video_id,
        title=title,
        artist=uploader,
        artwork=artwork,
        duration=int(duration) if duration else None,
        source="youtube",
    )


def _normalize_ytm_track(item: dict, exclude_id: Optional[str] = None) -> Optional[Track]:
    video_id = item.get("videoId")
    if not video_id or not is_valid_video_id(video_id) or (exclude_id and video_id == exclude_id):
        return None
    title = item.get("title") or "Unknown"
    artists_list = item.get("artists") or []
    artist_names = [a.get("name") for a in artists_list if isinstance(a, dict) and a.get("name")]
    artist = ", ".join(artist_names) if artist_names else "Unknown Artist"

    album_info = item.get("album")
    album_name = album_info.get("name") if isinstance(album_info, dict) else None

    duration = item.get("duration_seconds")
    if duration is None:
        dur_str = item.get("duration")
        if dur_str and ":" in str(dur_str):
            parts = str(dur_str).split(":")
            try:
                if len(parts) == 2:
                    duration = int(parts[0]) * 60 + int(parts[1])
                elif len(parts) == 3:
                    duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            except ValueError:
                duration = None

    thumbnails = item.get("thumbnails") or []
    artwork = ""
    if thumbnails and isinstance(thumbnails[-1], dict):
        artwork = thumbnails[-1].get("url", "")
        if artwork:
            artwork = re.sub(r"=w\d+-h\d+", "=w544-h544", artwork)

    return Track(
        id=video_id,
        title=title,
        artist=artist,
        artwork=artwork,
        duration=int(duration) if duration else None,
        album=album_name,
        source="youtube",
    )


def search_ytmusic(query: str, limit: int = 10) -> list[Track]:
    """Search YouTube Music songs using ytmusicapi."""
    if not get_ytmusic:
        return []
    try:
        ytm = get_ytmusic()
        raw = ytm.search(query, filter="songs")
        tracks: list[Track] = []
        for item in raw:
            if not isinstance(item, dict) or item.get("resultType") != "song":
                continue
            track = _normalize_ytm_track(item)
            if track:
                tracks.append(track)
            if len(tracks) >= limit:
                break
        return tracks
    except Exception:
        return []


_DERIVATIVE_RE = re.compile(
    r"\b(x|vs|mashup|remix|mix|flip|edit|slowed|reverb|lofi|cover|live|acoustic|bootleg|version|extended|bgm|theme)\b",
    re.IGNORECASE,
)

def _query_keyword_tokens(text: str) -> set[str]:
    """Extract significant lowercase keyword tokens from search query or title."""
    words = re.findall(r"[a-z0-9]+", str(text).lower())
    stop_words = {"the", "a", "an", "and", "by", "of", "in", "to", "for", "with", "feat", "ft", "official", "video", "audio"}
    return {w for w in words if len(w) > 1 and w not in stop_words}

def _calculate_token_coverage(query: str, title: str, artist: str = "") -> float:
    """Calculate the ratio of query keywords found in the candidate track title and artist."""
    q_tokens = _query_keyword_tokens(query)
    if not q_tokens:
        return 1.0
    candidate_tokens = _query_keyword_tokens(f"{title} {artist}")
    matched = q_tokens.intersection(candidate_tokens)
    return len(matched) / len(q_tokens)

def search_ytdlp(query: str, limit: int = 10) -> list[Track]:
    """Search full YouTube catalog via yt-dlp across client candidates."""
    for client_list in CLIENT_CANDIDATES:
        try:
            opts = _base_opts(player_client=client_list)
            opts.update({
                "extract_flat": "in_playlist",
                "playlist_items": f"1-{limit}",
            })
            url = f"ytsearch{limit}:{query}"
            results: list[Track] = []
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                entries = (info or {}).get("entries") or []
                for entry in entries:
                    if not entry:
                        continue
                    track = _normalize_entry(entry)
                    if track:
                        results.append(track)
            if results:
                return results
        except Exception:
            continue
    return []

def search_sync(query: str, limit: int = 10) -> list[Track]:
    """Intelligent hybrid search combining YouTube Music (API 1) and full YouTube yt-dlp (API 2).
    
    Detects crossover queries (e.g. 'Levitating X Woh ladki joh'), mashups, or low-coverage
    results from YouTube Music, seamlessly blending and ranking full YouTube results.
    """
    query_str = (query or "").strip()
    if not query_str:
        return []

    q_lower = query_str.lower()
    has_derivative_marker = (
        bool(_DERIVATIVE_RE.search(query_str))
        or " x " in q_lower
        or " vs " in q_lower
        or " + " in q_lower
    )

    # When a derivative/mashup marker is present, run both catalogs concurrently
    if has_derivative_marker:
        with ThreadPoolExecutor(max_workers=2) as pool:
            ytm_future = pool.submit(search_ytmusic, query_str, limit)
            ytdlp_future = pool.submit(search_ytdlp, query_str, limit)
            ytm_results = ytm_future.result()
            ytdlp_results = ytdlp_future.result()
    else:
        # 1. Primary: YouTube Music API
        ytm_results = search_ytmusic(query_str, limit=limit)

        top_coverage = 0.0
        if ytm_results:
            top_coverage = _calculate_token_coverage(query_str, ytm_results[0].title, ytm_results[0].artist)

        # If YouTube Music matched well, return fast without calling yt-dlp
        needs_api2 = (
            not ytm_results
            or top_coverage < 0.60
            or len(ytm_results) < min(3, limit)
        )

        if not needs_api2 and ytm_results:
            return ytm_results

        # 2. Secondary: Query Full YouTube (yt-dlp) for video/mashup catalog
        ytdlp_results = search_ytdlp(query_str, limit=limit)

    if not ytdlp_results:
        return ytm_results or []
    if not ytm_results:
        return ytdlp_results

    # 3. Hybrid Merge & Relevance Ranking
    seen_ids: set[str] = set()
    scored_candidates: list[tuple[float, Track]] = []

    # Score yt-dlp candidates (full YouTube)
    for track in ytdlp_results:
        if track.id not in seen_ids:
            seen_ids.add(track.id)
            cov = _calculate_token_coverage(query_str, track.title, track.artist)
            # Give boost to yt-dlp when user searched for a mashup/crossover
            boost = 0.35 if has_derivative_marker else 0.0
            scored_candidates.append((cov + boost, track))

    # Score YouTube Music candidates
    for track in ytm_results:
        if track.id not in seen_ids:
            seen_ids.add(track.id)
            cov = _calculate_token_coverage(query_str, track.title, track.artist)
            # Official songs get slight boost for standard searches, but not for mashups
            boost = 0.20 if not has_derivative_marker else -0.10
            scored_candidates.append((cov + boost, track))

    # Sort descending by composite relevance score
    scored_candidates.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored_candidates[:limit]]


class StreamInfo:
    __slots__ = ("url", "ext", "content_type", "title", "artist", "artwork", "duration")

    def __init__(self, *, url: str, ext: str, content_type: str, title: str, artist: str, artwork: str, duration: Optional[int]) -> None:
        self.url = url
        self.ext = ext
        self.content_type = content_type
        self.title = title
        self.artist = artist
        self.artwork = artwork
        self.duration = duration


_EXT_TO_CONTENT_TYPE: dict[str, str] = {
    "m4a": "audio/mp4",
    "mp4": "video/mp4",
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "opus": "audio/ogg; codecs=opus",
    "mp3": "audio/mpeg",
    "aac": "audio/aac",
}


_DEFAULT_INVIDIOUS_INSTANCES = [
    "https://yt.chocolatemoo53.com",
    "https://inv.tux.pizza",
]
INVIDIOUS_INSTANCES: list[str] = [
    u.strip().rstrip("/")
    for u in os.environ.get("INVIDIOUS_INSTANCES", "").split(",")
    if u.strip()
] or list(_DEFAULT_INVIDIOUS_INSTANCES)

def _resolve_invidious_sync(video_id: str) -> tuple[Optional[StreamInfo], Optional[str]]:
    errs = []
    with httpx.Client(timeout=4.0, follow_redirects=True) as client:
        for inst in INVIDIOUS_INSTANCES:
            try:
                res = client.get(f"{inst}/api/v1/videos/{video_id}")
                if res.status_code != 200:
                    errs.append(f"{inst}: HTTP {res.status_code}")
                    continue
                data = res.json()
                formats = data.get("adaptiveFormats", []) + data.get("formatStreams", [])
                audio = [f for f in formats if "audio" in f.get("type", "").lower() and f.get("url")]
                if not audio:
                    errs.append(f"{inst}: no audio stream")
                    continue
                best = max(audio, key=lambda a: int(a.get("bitrate") or 0))
                stream_url = best["url"]
                ext = "m4a" if "mp4" in best.get("type", "").lower() else "webm"
                content_type = _EXT_TO_CONTENT_TYPE.get(ext, "audio/mp4")
                title = data.get("title") or "Unknown"
                artist = data.get("author") or "Unknown Artist"
                thumbnails = data.get("videoThumbnails") or []
                artwork = thumbnails[-1].get("url") if thumbnails else ""
                duration = data.get("lengthSeconds")
                return (StreamInfo(
                    url=stream_url,
                    ext=ext,
                    content_type=content_type,
                    title=title,
                    artist=artist,
                    artwork=artwork,
                    duration=int(duration) if duration else None,
                ), None)
            except Exception as e:
                errs.append(f"{inst}: {e}")
                continue
    return (None, "; ".join(errs))


def resolve_sync(video_id: str) -> StreamInfo:
    if not is_valid_video_id(video_id):
        raise ValueError(f"Invalid video ID: {video_id!r}")

    url = f"https://www.youtube.com/watch?v={video_id}"
    last_err: Optional[Exception] = None

    # Layer 1: yt-dlp across client candidates
    for client_list in CLIENT_CANDIDATES:
        try:
            opts = _base_opts(player_client=client_list)
            opts["format"] = YTDLP_FORMAT

            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)

            if not info:
                continue

            requested_formats = info.get("requested_formats") or []
            fmt = requested_formats[0] if requested_formats else info

            stream_url: str = fmt.get("url") or ""
            if not stream_url:
                formats = info.get("formats") or []
                audio_formats = [f for f in formats if f.get("vcodec") == "none" and f.get("url")]
                if audio_formats:
                    m4a_audio = [f for f in audio_formats if f.get("ext") == "m4a"]
                    fmt = max(m4a_audio or audio_formats, key=lambda a: a.get("tbr") or a.get("abr") or 0)
                    stream_url = fmt.get("url") or ""
            if not stream_url:
                continue

            ext: str = fmt.get("ext") or info.get("ext") or "m4a"
            content_type: str = _EXT_TO_CONTENT_TYPE.get(ext, "audio/mp4")

            title: str = info.get("title") or "Unknown"
            artist: str = info.get("artist") or info.get("creator") or info.get("uploader") or "Unknown Artist"
            thumbnails: list = info.get("thumbnails") or []
            artwork: str = ""
            if thumbnails:
                for t in reversed(thumbnails):
                    if isinstance(t, dict) and t.get("url"):
                        artwork = t["url"]
                        break
            if not artwork:
                artwork = info.get("thumbnail") or ""

            duration: Optional[int] = info.get("duration")

            return StreamInfo(
                url=stream_url,
                ext=ext,
                content_type=content_type,
                title=title,
                artist=artist,
                artwork=artwork,
                duration=int(duration) if duration else None,
            )
        except Exception as exc:
            last_err = exc
            continue

    # Layer 2: Invidious high-availability API fallback for datacenter IPs
    fallback_info, inv_err = _resolve_invidious_sync(video_id)
    if fallback_info:
        return fallback_info

    raise RuntimeError(f"Could not resolve stream URL for {video_id}: ytdlp=[{last_err}]; invidious=[{inv_err}]")


# ---------------------------------------------------------------------------
# Router & Endpoints
# ---------------------------------------------------------------------------

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    v = get_ytdlp_version()
    return HealthResponse(
        status="ok" if v else "degraded",
        ytdlp_version=v,
        ytdlp_available=bool(v),
    )


@router.get("/search", response_model=SearchResponse)
async def search(q: str = "", limit: int = 10) -> SearchResponse:
    q_str = q.strip()
    if not q_str:
        raise HTTPException(status_code=400, detail={"error": "Query parameter 'q' is required", "code": "missing_query"})
    if len(q_str) > 200:
        raise HTTPException(status_code=400, detail={"error": "Query exceeds 200 characters", "code": "query_too_long"})

    limit_val = max(1, min(limit, 50))
    cache_key = f"search:{q_str.lower()}:{limit_val}"
    cached = await search_cache.get(cache_key)
    if cached is not None:
        return SearchResponse(results=cached, query=q_str, cached=True)

    try:
        results: list[Track] = await asyncio.to_thread(search_sync, q_str, limit_val)
    except Exception as exc:
        logger.warning("Search failed for %r: %s", q_str, exc)
        raise HTTPException(
            status_code=502,
            detail={"error": "Search failed", "code": "search_error"},
        )

    await search_cache.set(cache_key, results, SEARCH_TTL)
    return SearchResponse(results=results, query=q_str, cached=False)


_http_client: Optional[httpx.AsyncClient] = None
_resolve_locks: dict[str, asyncio.Lock] = {}
_resolve_locks_guard = asyncio.Lock()

_UPSTREAM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            follow_redirects=True,
        )
    return _http_client


async def _close_http_client() -> None:
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
    _http_client = None


async def _get_resolve_lock(video_id: str) -> asyncio.Lock:
    async with _resolve_locks_guard:
        lock = _resolve_locks.get(video_id)
        if lock is None:
            lock = asyncio.Lock()
            _resolve_locks[video_id] = lock
        return lock


async def _resolve_with_retry(video_id: str) -> tuple[StreamInfo, bool]:
    cache_key = f"stream:{video_id}"
    cached: Optional[StreamInfo] = await stream_cache.get(cache_key)
    if cached is not None:
        return cached, True

    # Single-flight lock so concurrent requests for the same track share one extraction
    lock = await _get_resolve_lock(video_id)
    async with lock:
        cached = await stream_cache.get(cache_key)
        if cached is not None:
            return cached, True

        info: StreamInfo = await asyncio.to_thread(resolve_sync, video_id)
        await stream_cache.set(cache_key, info, STREAM_TTL)
        return info, False


async def _stream_proxy(video_id: str, request: Request, allow_re_resolve: bool = True) -> StreamingResponse:
    info, _ = await _resolve_with_retry(video_id)

    range_header = request.headers.get("range")
    if_range = request.headers.get("if-range")

    headers_to_upstream: dict[str, str] = {"User-Agent": _UPSTREAM_UA}
    if range_header:
        headers_to_upstream["Range"] = range_header
    if if_range:
        headers_to_upstream["If-Range"] = if_range

    client = _get_http_client()
    try:
        upstream = await client.send(
            client.build_request("GET", info.url, headers=headers_to_upstream),
            stream=True,
        )
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc

    if upstream.status_code in (403, 410) and allow_re_resolve:
        await upstream.aclose()
        await stream_cache.delete(f"stream:{video_id}")
        return await _stream_proxy(video_id, request, allow_re_resolve=False)

    if upstream.status_code not in (200, 206):
        status_code = upstream.status_code
        await upstream.aclose()
        raise RuntimeError(f"Upstream returned HTTP {status_code}")

    resp_headers: dict[str, str] = {
        "Content-Type": info.content_type,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
    }
    for h in ("content-length", "content-range", "content-type"):
        if h in upstream.headers:
            resp_headers[h.replace("-", "_").title().replace("_", "-")] = upstream.headers[h]

    status = upstream.status_code

    async def _generate():
        try:
            async for chunk in upstream.aiter_bytes(STREAM_CHUNK):
                yield chunk
        finally:
            await upstream.aclose()

    return StreamingResponse(
        _generate(),
        status_code=status,
        headers=resp_headers,
    )


@router.get("/stream/{video_id}")
async def stream(video_id: str, request: Request) -> Response:
    if not is_valid_video_id(video_id):
        raise HTTPException(status_code=400, detail={"error": "Invalid video ID format", "code": "invalid_id"})
    try:
        return await _stream_proxy(video_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc), "code": "invalid_id"})
    except Exception as exc:
        logger.warning("Upstream proxy failed for %s: %s", video_id, exc)
        raise HTTPException(status_code=502, detail={"error": "Upstream audio stream unavailable", "code": "proxy_error"})


@router.head("/stream/{video_id}")
async def stream_head(video_id: str) -> Response:
    if not is_valid_video_id(video_id):
        raise HTTPException(status_code=400, detail={"error": "Invalid video ID format", "code": "invalid_id"})
    try:
        info, _ = await _resolve_with_retry(video_id)
        headers: dict[str, str] = {
            "Content-Type": info.content_type,
            "Accept-Ranges": "bytes",
        }
        try:
            client = _get_http_client()
            head_res = await client.head(info.url, headers={"User-Agent": _UPSTREAM_UA}, timeout=5.0)
            if head_res.status_code in (200, 206):
                if "content-length" in head_res.headers:
                    headers["Content-Length"] = head_res.headers["content-length"]
                if "content-type" in head_res.headers:
                    headers["Content-Type"] = head_res.headers["content-type"]
        except Exception:
            pass
        return Response(status_code=200, headers=headers)
    except Exception as exc:
        logger.warning("HEAD stream failed for %s: %s", video_id, exc)
        raise HTTPException(status_code=502, detail={"error": "Unable to resolve stream metadata", "code": "proxy_error"})


@router.get("/resolve/{video_id}", response_model=ResolveResponse)
async def resolve(video_id: str) -> ResolveResponse:
    if not is_valid_video_id(video_id):
        raise HTTPException(status_code=400, detail={"error": "Invalid video ID format", "code": "invalid_id"})
    try:
        info, was_cached = await _resolve_with_retry(video_id)
    except Exception as exc:
        logger.warning("Resolve failed for %s: %s", video_id, exc)
        raise HTTPException(status_code=502, detail={"error": "Unable to resolve audio stream", "code": "resolve_error"})

    return ResolveResponse(
        id=video_id,
        title=info.title,
        artist=info.artist,
        artwork=info.artwork,
        duration=info.duration,
        stream_url=info.url,
        ext=info.ext,
        cached=was_cached,
    )


def related_sync(video_id: str, limit: int = 20) -> list[Track]:
    """Get related / up next tracks via YouTube Music watch playlist."""
    if not get_ytmusic:
        return []
    try:
        ytm = get_ytmusic()
        watch = ytm.get_watch_playlist(videoId=video_id)
        raw_tracks = watch.get("tracks") or []
        tracks: list[Track] = []
        for item in raw_tracks:
            if not isinstance(item, dict):
                continue
            track = _normalize_ytm_track(item, exclude_id=video_id)
            if track:
                tracks.append(track)
            if len(tracks) >= limit:
                break
        return tracks
    except Exception:
        return []


def lyrics_sync(video_id: str) -> Optional[str]:
    """Get lyrics for a track via YouTube Music."""
    if not get_ytmusic:
        return None
    try:
        ytm = get_ytmusic()
        watch = ytm.get_watch_playlist(videoId=video_id)
        browse_id = watch.get("lyrics")
        if not browse_id:
            return None
        lyr = ytm.get_lyrics(browse_id)
        return lyr.get("lyrics") if isinstance(lyr, dict) else None
    except Exception:
        return None


@router.get("/related/{video_id}")
async def related(video_id: str, limit: int = 20) -> list[Track]:
    if not is_valid_video_id(video_id):
        raise HTTPException(status_code=400, detail={"error": "Invalid video ID format", "code": "invalid_id"})
    limit_val = max(1, min(limit, 50))
    cache_key = f"related:{video_id}:{limit_val}"
    cached = await search_cache.get(cache_key)
    if cached is not None:
        return cached
    results: list[Track] = await asyncio.to_thread(related_sync, video_id, limit_val)
    await search_cache.set(cache_key, results, SEARCH_TTL)
    return results


@router.get("/lyrics/{video_id}")
async def lyrics_endpoint(video_id: str) -> dict[str, Any]:
    if not is_valid_video_id(video_id):
        raise HTTPException(status_code=400, detail={"error": "Invalid video ID format", "code": "invalid_id"})
    cache_key = f"lyrics:{video_id}"
    cached = await search_cache.get(cache_key)
    if cached is not None:
        return cached
    text = await asyncio.to_thread(lyrics_sync, video_id)
    if not text:
        raise HTTPException(status_code=404, detail={"error": "Lyrics not found", "code": "lyrics_not_found"})
    data = {"lyrics": text, "source": "YouTube Music"}
    await search_cache.set(cache_key, data, STREAM_TTL)
    return data


def _ytm_thumb(thumbnails: Any, size: int = 544) -> str:
    if not isinstance(thumbnails, list) or not thumbnails:
        return ""
    url = thumbnails[-1].get("url", "") if isinstance(thumbnails[-1], dict) else ""
    if url:
        url = re.sub(r"=w\d+-h\d+", f"=w{size}-h{size}", url)
    return url


def _ytm_duration(item: dict) -> Optional[int]:
    duration = item.get("duration_seconds")
    if duration is None:
        dur_str = item.get("duration")
        if dur_str and ":" in str(dur_str):
            parts = str(dur_str).split(":")
            try:
                if len(parts) == 2:
                    duration = int(parts[0]) * 60 + int(parts[1])
                elif len(parts) == 3:
                    duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            except ValueError:
                duration = None
    return int(duration) if duration else None


def search_albums_sync(query: str, limit: int = 8) -> list[dict[str, Any]]:
    if not get_ytmusic:
        return []
    try:
        ytm = get_ytmusic()
        raw = ytm.search(query, filter="albums") or []
        results: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            browse_id = item.get("browseId") or ""
            if not browse_id or not is_valid_browse_id(browse_id):
                continue
            artists = item.get("artists") or []
            artist_names = [a.get("name") for a in artists if isinstance(a, dict) and a.get("name")]
            results.append({
                "id": browse_id,
                "name": item.get("title") or "Unknown Album",
                "title": item.get("title") or "Unknown Album",
                "artist": ", ".join(artist_names) if artist_names else "Album",
                "year": str(item.get("year") or ""),
                "artwork": _ytm_thumb(item.get("thumbnails")),
                "img": _ytm_thumb(item.get("thumbnails")),
                "type": "album",
            })
            if len(results) >= limit:
                break
        return results
    except Exception:
        return []


def search_artists_sync(query: str, limit: int = 8) -> list[dict[str, Any]]:
    if not get_ytmusic:
        return []
    try:
        ytm = get_ytmusic()
        raw = ytm.search(query, filter="artists") or []
        results: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            browse_id = item.get("browseId") or ""
            if not browse_id or not is_valid_browse_id(browse_id):
                continue
            name = item.get("artist") or item.get("title") or "Unknown Artist"
            results.append({
                "id": browse_id,
                "name": name,
                "artist": "Artist",
                "artwork": _ytm_thumb(item.get("thumbnails")),
                "img": _ytm_thumb(item.get("thumbnails")),
                "type": "artist",
            })
            if len(results) >= limit:
                break
        return results
    except Exception:
        return []


def get_album_sync(album_id: str) -> Optional[dict[str, Any]]:
    if not get_ytmusic:
        return None
    try:
        ytm = get_ytmusic()
        data = ytm.get_album(album_id)
        if not isinstance(data, dict):
            return None
        artwork = _ytm_thumb(data.get("thumbnails"))
        artists = data.get("artists") or []
        artist_names = [a.get("name") for a in artists if isinstance(a, dict) and a.get("name")]
        primary_artist_id = next((a.get("id") for a in artists if isinstance(a, dict) and a.get("id")), "")
        album_title = data.get("title") or "Album"
        songs: list[dict[str, Any]] = []
        for item in data.get("tracks") or []:
            if not isinstance(item, dict):
                continue
            vid = item.get("videoId") or ""
            if not vid or not is_valid_video_id(vid):
                continue
            t_artists = item.get("artists") or artists
            t_artist_names = [a.get("name") for a in t_artists if isinstance(a, dict) and a.get("name")]
            songs.append(Track(
                id=vid,
                title=item.get("title") or "Unknown",
                artist=", ".join(t_artist_names) if t_artist_names else (", ".join(artist_names) or "Unknown Artist"),
                artwork=_ytm_thumb(item.get("thumbnails")) or artwork,
                duration=_ytm_duration(item),
                album=album_title,
                source="youtube",
            ).model_dump())
        return {
            "id": album_id,
            "name": album_title,
            "title": album_title,
            "artist": ", ".join(artist_names) if artist_names else "Artist",
            "artistId": primary_artist_id,
            "year": str(data.get("year") or ""),
            "artwork": artwork,
            "img": artwork,
            "songs": songs,
        }
    except Exception:
        return None


def get_artist_sync(artist_id: str) -> Optional[dict[str, Any]]:
    if not get_ytmusic:
        return None
    try:
        ytm = get_ytmusic()
        data = ytm.get_artist(artist_id)
        if not isinstance(data, dict):
            return None
        name = data.get("name") or "Artist"
        artwork = _ytm_thumb(data.get("thumbnails"))
        top_songs: list[dict[str, Any]] = []
        songs_section = data.get("songs") or {}
        for item in (songs_section.get("results") or [])[:15]:
            if not isinstance(item, dict):
                continue
            vid = item.get("videoId") or ""
            if not vid or not is_valid_video_id(vid):
                continue
            t_artists = item.get("artists") or []
            t_artist_names = [a.get("name") for a in t_artists if isinstance(a, dict) and a.get("name")]
            album_info = item.get("album")
            album_name = album_info.get("name") if isinstance(album_info, dict) else None
            top_songs.append(Track(
                id=vid,
                title=item.get("title") or "Unknown",
                artist=", ".join(t_artist_names) if t_artist_names else name,
                artwork=_ytm_thumb(item.get("thumbnails")) or artwork,
                duration=_ytm_duration(item),
                album=album_name,
                source="youtube",
            ).model_dump())
        top_albums: list[dict[str, Any]] = []
        albums_section = data.get("albums") or {}
        for item in (albums_section.get("results") or [])[:12]:
            if not isinstance(item, dict):
                continue
            bid = item.get("browseId") or ""
            if not bid or not is_valid_browse_id(bid):
                continue
            top_albums.append({
                "id": bid,
                "name": item.get("title") or "Album",
                "title": item.get("title") or "Album",
                "year": str(item.get("year") or ""),
                "artwork": _ytm_thumb(item.get("thumbnails")),
                "img": _ytm_thumb(item.get("thumbnails")),
                "type": "album",
            })
        return {
            "id": artist_id,
            "name": name,
            "artwork": artwork,
            "img": artwork,
            "subscribers": str(data.get("subscribers") or ""),
            "topSongs": top_songs,
            "topAlbums": top_albums,
        }
    except Exception:
        return None


@router.get("/search/albums")
async def search_albums(q: str = "", limit: int = 8) -> dict[str, Any]:
    q_str = q.strip()
    if not q_str:
        raise HTTPException(status_code=400, detail={"error": "Query parameter 'q' is required", "code": "missing_query"})
    if len(q_str) > 200:
        raise HTTPException(status_code=400, detail={"error": "Query exceeds 200 characters", "code": "query_too_long"})
    limit_val = max(1, min(limit, 25))
    cache_key = f"search_albums:{q_str.lower()}:{limit_val}"
    cached = await search_cache.get(cache_key)
    if cached is not None:
        return {"results": cached, "query": q_str, "cached": True}
    results = await asyncio.to_thread(search_albums_sync, q_str, limit_val)
    await search_cache.set(cache_key, results, SEARCH_TTL)
    return {"results": results, "query": q_str, "cached": False}


@router.get("/search/artists")
async def search_artists(q: str = "", limit: int = 8) -> dict[str, Any]:
    q_str = q.strip()
    if not q_str:
        raise HTTPException(status_code=400, detail={"error": "Query parameter 'q' is required", "code": "missing_query"})
    if len(q_str) > 200:
        raise HTTPException(status_code=400, detail={"error": "Query exceeds 200 characters", "code": "query_too_long"})
    limit_val = max(1, min(limit, 25))
    cache_key = f"search_artists:{q_str.lower()}:{limit_val}"
    cached = await search_cache.get(cache_key)
    if cached is not None:
        return {"results": cached, "query": q_str, "cached": True}
    results = await asyncio.to_thread(search_artists_sync, q_str, limit_val)
    await search_cache.set(cache_key, results, SEARCH_TTL)
    return {"results": results, "query": q_str, "cached": False}


@router.get("/album/{album_id}")
async def album_endpoint(album_id: str) -> dict[str, Any]:
    if not is_valid_browse_id(album_id):
        raise HTTPException(status_code=400, detail={"error": "Invalid album ID format", "code": "invalid_id"})
    cache_key = f"album:{album_id}"
    cached = await search_cache.get(cache_key)
    if cached is not None:
        return cached
    data = await asyncio.to_thread(get_album_sync, album_id)
    if not data:
        raise HTTPException(status_code=404, detail={"error": "Album not found", "code": "album_not_found"})
    await search_cache.set(cache_key, data, SEARCH_TTL)
    return data


@router.get("/artist/{artist_id}")
async def artist_endpoint(artist_id: str) -> dict[str, Any]:
    if not is_valid_browse_id(artist_id):
        raise HTTPException(status_code=400, detail={"error": "Invalid artist ID format", "code": "invalid_id"})
    cache_key = f"artist:{artist_id}"
    cached = await search_cache.get(cache_key)
    if cached is not None:
        return cached
    data = await asyncio.to_thread(get_artist_sync, artist_id)
    if not data:
        raise HTTPException(status_code=404, detail={"error": "Artist not found", "code": "artist_not_found"})
    await search_cache.set(cache_key, data, SEARCH_TTL)
    return data


_LEGACY_SAAVN_API = os.environ.get("LEGACY_JIOSAAVN_API", "https://jiosaavn-api-taupe-phi.vercel.app/api").rstrip("/")
_SAAVN_ID_RE = re.compile(r"^[A-Za-z0-9_-]{4,32}$")


def migrate_saavn_id_sync(saavn_id: str) -> Optional[Track]:
    """Resolve a bare legacy JioSaavn song ID by fetching its metadata and matching on YouTube Music."""
    try:
        with httpx.Client(timeout=5.0, follow_redirects=True) as client:
            res = client.get(f"{_LEGACY_SAAVN_API}/songs/{saavn_id}")
            if res.status_code != 200:
                return None
            payload = res.json()
            items = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(items, list) or not items:
                return None
            song = items[0]
            title = (song.get("name") or song.get("title") or "").strip()
            artists_obj = song.get("artists") or {}
            primary = artists_obj.get("primary") if isinstance(artists_obj, dict) else None
            if isinstance(primary, list) and primary:
                artist = ", ".join(a.get("name", "") for a in primary if isinstance(a, dict) and a.get("name"))
            else:
                artist = str(song.get("primaryArtists") or "").strip()
            if not title:
                return None
            query = f"{title} {artist}".strip()
            candidates = search_sync(query, limit=5)
            if not candidates:
                return None
            target_dur = int(song.get("duration") or 0)
            if target_dur > 0:
                best = min(
                    candidates,
                    key=lambda c: abs((c.duration or target_dur) - target_dur) if c.duration else 9999,
                )
                return best
            return candidates[0]
    except Exception as exc:
        logger.warning("Legacy JioSaavn migration failed for %s: %s", saavn_id, exc)
        return None


@router.get("/migrate/saavn/{saavn_id}", response_model=Track)
async def migrate_saavn_endpoint(saavn_id: str) -> Track:
    if not _SAAVN_ID_RE.match(saavn_id):
        raise HTTPException(status_code=400, detail={"error": "Invalid legacy song ID", "code": "invalid_id"})
    cache_key = f"migrate_saavn:{saavn_id}"
    cached = await search_cache.get(cache_key)
    if cached is not None:
        return cached
    track = await asyncio.to_thread(migrate_saavn_id_sync, saavn_id)
    if not track:
        raise HTTPException(status_code=404, detail={"error": "Legacy track could not be matched", "code": "migration_not_found"})
    await search_cache.set(cache_key, track, STREAM_TTL)
    return track


# ---------------------------------------------------------------------------
# App initialization & Multi-prefix mounting
# ---------------------------------------------------------------------------

@asynccontextmanager
async def _lifespan(_app: FastAPI):
    try:
        yield
    finally:
        await _close_http_client()


app = FastAPI(
    title="D'Tunes API v2",
    description="yt-dlp Media Backend for D'Tunes",
    version="2.0.0",
    lifespan=_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

# Support /api-v2/*, /api/v2/*, /api/*, and direct /* routes seamlessly
app.include_router(router, prefix="/api-v2")
app.include_router(router, prefix="/api/v2")
app.include_router(router, prefix="/api")
app.include_router(router)
