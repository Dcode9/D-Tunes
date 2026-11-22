"""FastAPI application – D'Tunes API v2 (yt-dlp Media Backend).

Byte-range audio proxy backed by yt-dlp. Streams audio directly
without storing files to disk. Supports HTTP Range requests (206 Partial Content).
"""
from __future__ import annotations

import asyncio
import os
import re
import time
from typing import Any, Optional

import httpx
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, field_validator
import yt_dlp

try:
    from ytmusicapi import YTMusic
    _ytmusic_client: Optional[YTMusic] = None

    def get_ytmusic() -> YTMusic:
        global _ytmusic_client
        if _ytmusic_client is None:
            _ytmusic_client = YTMusic()
        return _ytmusic_client
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
    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}
        self._lock = asyncio.Lock()

    def _get_sync(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def _set_sync(self, key: str, value: Any, ttl: float) -> None:
        self._store[key] = (value, time.monotonic() + ttl)

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            return self._get_sync(key)

    async def set(self, key: str, value: Any, ttl: float) -> None:
        async with self._lock:
            self._set_sync(key, value, ttl)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._store.pop(key, None)


search_cache = TTLCache()
stream_cache = TTLCache()

SEARCH_TTL = 5 * 60       # 5 minutes
STREAM_TTL = 55 * 60      # 55 minutes
STREAM_CHUNK = 65_536     # 64 KiB chunks
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

def is_valid_video_id(video_id: str) -> bool:
    return bool(_VIDEO_ID_RE.match(video_id))


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
        cookies_path = "/tmp/ytdlp_cookies.txt"
        try:
            with open(cookies_path, "w", encoding="utf-8") as f:
                f.write(cookies_text)
            opts["cookiefile"] = cookies_path
        except Exception:
            pass
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
            video_id = item.get("videoId")
            if not video_id or not is_valid_video_id(video_id):
                continue
            title = item.get("title") or "Unknown"
            artists_list = item.get("artists") or []
            artist_names = [a.get("name") for a in artists_list if isinstance(a, dict) and a.get("name")]
            artist = ", ".join(artist_names) if artist_names else "Unknown Artist"

            album_info = item.get("album")
            album_name = album_info.get("name") if isinstance(album_info, dict) else None

            duration = item.get("duration_seconds")
            if duration is None:
                dur_str = item.get("duration")
                if dur_str and ":" in dur_str:
                    parts = dur_str.split(":")
                    try:
                        if len(parts) == 2:
                            duration = int(parts[0]) * 60 + int(parts[1])
                        elif len(parts) == 3:
                            duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                    except ValueError:
                        duration = None

            thumbnails = item.get("thumbnails") or []
            artwork = ""
            if thumbnails:
                artwork = thumbnails[-1].get("url", "")
                if artwork:
                    artwork = re.sub(r"=w\d+-h\d+", "=w544-h544", artwork)

            tracks.append(
                Track(
                    id=video_id,
                    title=title,
                    artist=artist,
                    artwork=artwork,
                    duration=int(duration) if duration else None,
                    album=album_name,
                    source="youtube",
                )
            )
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

    # 1. Primary: YouTube Music API
    ytm_results = search_ytmusic(query_str, limit=limit)

    top_coverage = 0.0
    if ytm_results:
        top_coverage = _calculate_token_coverage(query_str, ytm_results[0].title, ytm_results[0].artist)

    # If YouTube Music matched well and it's not a crossover/mashup query, return fast
    needs_api2 = (
        has_derivative_marker
        or not ytm_results
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


INVIDIOUS_INSTANCES = [
    "https://yt.chocolatemoo53.com",
    "https://inv.tux.pizza",
]

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
        raise HTTPException(
            status_code=502,
            detail={"error": "Search failed", "code": "search_error", "detail": str(exc)},
        )

    await search_cache.set(cache_key, results, SEARCH_TTL)
    return SearchResponse(results=results, query=q_str, cached=False)


async def _resolve_with_retry(video_id: str) -> tuple[StreamInfo, bool]:
    cache_key = f"stream:{video_id}"
    cached: Optional[StreamInfo] = await stream_cache.get(cache_key)
    if cached is not None:
        return cached, True

    info: StreamInfo = await asyncio.to_thread(resolve_sync, video_id)
    await stream_cache.set(cache_key, info, STREAM_TTL)
    return info, False


async def _stream_proxy(video_id: str, request: Request, allow_re_resolve: bool = True) -> StreamingResponse:
    info, _ = await _resolve_with_retry(video_id)

    range_header = request.headers.get("range")
    if_range = request.headers.get("if-range")

    headers_to_upstream: dict[str, str] = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    if range_header:
        headers_to_upstream["Range"] = range_header
    if if_range:
        headers_to_upstream["If-Range"] = if_range

    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0), follow_redirects=True)
    try:
        upstream = await client.send(
            client.build_request("GET", info.url, headers=headers_to_upstream),
            stream=True,
        )
    except Exception as exc:
        await client.aclose()
        raise RuntimeError(str(exc)) from exc

    if upstream.status_code in (403, 410) and allow_re_resolve:
        await client.aclose()
        await stream_cache.delete(f"stream:{video_id}")
        return await _stream_proxy(video_id, request, allow_re_resolve=False)

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
            await client.aclose()

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
        raise HTTPException(status_code=502, detail={"error": f"Upstream proxy failed: {exc}", "code": "proxy_error"})


@router.head("/stream/{video_id}")
async def stream_head(video_id: str) -> Response:
    if not is_valid_video_id(video_id):
        raise HTTPException(status_code=400, detail={"error": "Invalid video ID format", "code": "invalid_id"})
    try:
        info, _ = await _resolve_with_retry(video_id)
        return Response(status_code=200, headers={"Content-Type": info.content_type, "Accept-Ranges": "bytes"})
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"error": str(exc), "code": "proxy_error"})


@router.get("/resolve/{video_id}", response_model=ResolveResponse)
async def resolve(video_id: str) -> ResolveResponse:
    if not is_valid_video_id(video_id):
        raise HTTPException(status_code=400, detail={"error": "Invalid video ID format", "code": "invalid_id"})
    try:
        info, was_cached = await _resolve_with_retry(video_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"error": str(exc), "code": "resolve_error"})

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
            v_id = item.get("videoId")
            if not v_id or not is_valid_video_id(v_id) or v_id == video_id:
                continue
            title = item.get("title") or "Unknown"
            artists_list = item.get("artists") or []
            artist_names = [a.get("name") for a in artists_list if isinstance(a, dict) and a.get("name")]
            artist = ", ".join(artist_names) if artist_names else "Unknown Artist"

            album_info = item.get("album")
            album_name = album_info.get("name") if isinstance(album_info, dict) else None

            duration = item.get("duration_seconds")
            if duration is None:
                dur_str = item.get("duration")
                if dur_str and ":" in dur_str:
                    parts = dur_str.split(":")
                    try:
                        if len(parts) == 2:
                            duration = int(parts[0]) * 60 + int(parts[1])
                        elif len(parts) == 3:
                            duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                    except ValueError:
                        duration = None

            thumbnails = item.get("thumbnails") or []
            artwork = ""
            if thumbnails:
                artwork = thumbnails[-1].get("url", "")
                if artwork:
                    artwork = re.sub(r"=w\d+-h\d+", "=w544-h544", artwork)

            tracks.append(
                Track(
                    id=v_id,
                    title=title,
                    artist=artist,
                    artwork=artwork,
                    duration=int(duration) if duration else None,
                    album=album_name,
                    source="youtube",
                )
            )
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


# ---------------------------------------------------------------------------
# App initialization & Multi-prefix mounting
# ---------------------------------------------------------------------------

app = FastAPI(
    title="D'Tunes API v2",
    description="yt-dlp Media Backend for D'Tunes",
    version="2.0.0",
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
