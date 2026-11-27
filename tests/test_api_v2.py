"""Unit & integration tests for D'Tunes API v2 (api/v2.py)."""
from __future__ import annotations

import asyncio
import importlib.util
import os
import stat
import sys
import time
import types
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient


def _load_v2_module():
    if "yt_dlp" not in sys.modules:
        fake_ytdlp = types.ModuleType("yt_dlp")
        fake_ytdlp.version = types.SimpleNamespace(__version__="2026.11.0-test")
        fake_ytdlp.YoutubeDL = object
        sys.modules["yt_dlp"] = fake_ytdlp

    v2_path = Path(__file__).resolve().parent.parent / "api" / "v2.py"
    spec = importlib.util.spec_from_file_location("dtunes_api_v2", v2_path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


v2 = _load_v2_module()


@pytest.fixture(autouse=True)
def _reset_caches():
    v2.search_cache._store.clear()
    v2.stream_cache._store.clear()
    v2._resolve_locks.clear()
    yield
    v2.search_cache._store.clear()
    v2.stream_cache._store.clear()
    v2._resolve_locks.clear()


def test_ttl_cache_lru_and_expiry():
    cache = v2.TTLCache(max_size=2)
    cache._set_sync("a", 1, ttl=60)
    cache._set_sync("b", 2, ttl=60)
    # Access "a" so "b" becomes least recently used
    assert cache._get_sync("a") == 1
    cache._set_sync("c", 3, ttl=60)
    assert cache._get_sync("b") is None
    assert cache._get_sync("a") == 1
    assert cache._get_sync("c") == 3

    cache._set_sync("short", 99, ttl=0.01)
    time.sleep(0.02)
    assert cache._get_sync("short") is None


def test_health_and_id_validation():
    with TestClient(v2.app) as client:
        res = client.get("/api-v2/health")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
        assert body["ytdlp_available"] is True

        assert client.get("/api-v2/stream/bad").status_code == 400
        assert client.get("/api-v2/resolve/too_short").status_code == 400
        assert client.get("/api-v2/album/!!invalid!!").status_code == 400
        assert client.get("/api-v2/artist/x").status_code == 400


def test_hybrid_search_runs_concurrent_for_mashups_and_caches():
    ytm_track = v2.Track(
        id="aaaaaaaaaaa",
        title="Levitating",
        artist="Dua Lipa",
        artwork="https://img.example/1.jpg",
        duration=203,
    )
    ytdlp_track = v2.Track(
        id="bbbbbbbbbbb",
        title="Levitating X Woh Ladki Jo Mashup",
        artist="DJ Mix",
        artwork="https://img.example/2.jpg",
        duration=210,
    )
    with patch.object(v2, "search_ytmusic", return_value=[ytm_track]) as mock_ytm, \
         patch.object(v2, "search_ytdlp", return_value=[ytdlp_track]) as mock_ytdlp:
        with TestClient(v2.app) as client:
            res = client.get("/api-v2/search", params={"q": "Levitating X Woh Ladki Jo", "limit": 5})
            assert res.status_code == 200
            data = res.json()
            assert data["cached"] is False
            assert data["results"][0]["id"] == "bbbbbbbbbbb"
            assert mock_ytm.call_count == 1
            assert mock_ytdlp.call_count == 1

            # Second identical request hits cache
            res2 = client.get("/api-v2/search", params={"q": "Levitating X Woh Ladki Jo", "limit": 5})
            assert res2.status_code == 200
            assert res2.json()["cached"] is True
            assert mock_ytm.call_count == 1


def test_single_flight_resolve_deduplicates_concurrent_extractions():
    calls = 0

    def slow_resolve(video_id: str):
        nonlocal calls
        calls += 1
        time.sleep(0.05)
        return v2.StreamInfo(
            url="https://cdn.example/audio.m4a",
            ext="m4a",
            content_type="audio/mp4",
            title="Test",
            artist="Artist",
            artwork="",
            duration=180,
        )

    async def _run():
        with patch.object(v2, "resolve_sync", side_effect=slow_resolve):
            r1, r2, r3 = await asyncio.gather(
                v2._resolve_with_retry("dQw4w9WgXcQ"),
                v2._resolve_with_retry("dQw4w9WgXcQ"),
                v2._resolve_with_retry("dQw4w9WgXcQ"),
            )
            return r1, r2, r3

    r1, r2, r3 = asyncio.run(_run())
    assert calls == 1
    assert r1[0].url == r2[0].url == r3[0].url
    assert [r1[1], r2[1], r3[1]].count(False) == 1
    assert [r1[1], r2[1], r3[1]].count(True) == 2


def test_stream_proxy_206_range_403_re_resolve_and_sanitized_502():
    info_expired = v2.StreamInfo(
        url="https://cdn.example/expired.m4a",
        ext="m4a",
        content_type="audio/mp4",
        title="Song",
        artist="Artist",
        artwork="",
        duration=200,
    )
    info_fresh = v2.StreamInfo(
        url="https://cdn.example/fresh.m4a",
        ext="m4a",
        content_type="audio/mp4",
        title="Song",
        artist="Artist",
        artwork="",
        duration=200,
    )

    resolve_calls = {"n": 0}

    def fake_resolve(video_id: str):
        resolve_calls["n"] += 1
        return info_expired if resolve_calls["n"] == 1 else info_fresh

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "HEAD":
            return httpx.Response(200, headers={"Content-Length": "123456", "Content-Type": "audio/mp4"})
        if str(request.url).endswith("expired.m4a"):
            return httpx.Response(403, content=b"Forbidden")
        if str(request.url).endswith("broken.m4a"):
            return httpx.Response(500, content=b"secret internal stack trace")
        return httpx.Response(
            206,
            content=b"AUDIO_BYTES",
            headers={
                "Content-Range": "bytes 0-10/123456",
                "Content-Length": "11",
                "Content-Type": "audio/mp4",
            },
        )

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    with patch.object(v2, "resolve_sync", side_effect=fake_resolve), \
         patch.object(v2, "_get_http_client", return_value=mock_client):
        with TestClient(v2.app) as client:
            # First GET hits 403 on expired URL, invalidates cache, re-resolves, and streams 206
            res = client.get("/api-v2/stream/dQw4w9WgXcQ", headers={"Range": "bytes=0-10"})
            assert res.status_code == 206
            assert res.content == b"AUDIO_BYTES"
            assert res.headers["content-range"] == "bytes 0-10/123456"
            assert resolve_calls["n"] == 2

            # HEAD returns Content-Length from upstream
            head_res = client.head("/api-v2/stream/dQw4w9WgXcQ")
            assert head_res.status_code == 200
            assert head_res.headers["content-length"] == "123456"

    # Non-200/206 upstream returns sanitized 502 without leaking internal details
    broken_info = v2.StreamInfo(
        url="https://cdn.example/broken.m4a",
        ext="m4a",
        content_type="audio/mp4",
        title="Broken",
        artist="Artist",
        artwork="",
        duration=100,
    )
    mock_client2 = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with patch.object(v2, "resolve_sync", return_value=broken_info), \
         patch.object(v2, "_get_http_client", return_value=mock_client2):
        with TestClient(v2.app) as client:
            res = client.get("/api-v2/stream/abcdefghijk")
            assert res.status_code == 502
            assert "secret internal" not in res.text
            assert res.json()["detail"]["code"] == "proxy_error"


def test_album_and_artist_routes():
    fake_album = {
        "id": "MPREb_12345",
        "name": "After Hours",
        "title": "After Hours",
        "artist": "The Weeknd",
        "artistId": "UC0WP5P-ufpRfjbNrmOWwLBQ",
        "year": "2020",
        "artwork": "https://img.example/album.jpg",
        "img": "https://img.example/album.jpg",
        "songs": [],
    }
    fake_artist = {
        "id": "UC0WP5P-ufpRfjbNrmOWwLBQ",
        "name": "The Weeknd",
        "artwork": "https://img.example/artist.jpg",
        "img": "https://img.example/artist.jpg",
        "subscribers": "35M",
        "topSongs": [],
        "topAlbums": [],
    }
    with patch.object(v2, "get_album_sync", return_value=fake_album), \
         patch.object(v2, "get_artist_sync", return_value=fake_artist):
        with TestClient(v2.app) as client:
            r_alb = client.get("/api-v2/album/MPREb_12345")
            assert r_alb.status_code == 200
            assert r_alb.json()["name"] == "After Hours"

            r_art = client.get("/api-v2/artist/UC0WP5P-ufpRfjbNrmOWwLBQ")
            assert r_art.status_code == 200
            assert r_art.json()["name"] == "The Weeknd"


def test_atomic_cookies_file_permissions():
    path = v2._ensure_cookies_file("# Netscape HTTP Cookie File\n")
    assert path is not None and os.path.exists(path)
    mode = stat.S_IMODE(os.stat(path).st_mode)
    assert mode == 0o600


def test_legacy_saavn_migration_route():
    matched = v2.Track(
        id="4NRXx6U8ABQ",
        title="Blinding Lights",
        artist="The Weeknd",
        artwork="https://img.example/blinding.jpg",
        duration=200,
    )
    with patch.object(v2, "migrate_saavn_id_sync", return_value=matched) as mock_mig:
        with TestClient(v2.app) as client:
            assert client.get("/api-v2/migrate/saavn/!!").status_code == 400
            r1 = client.get("/api-v2/migrate/saavn/8MT-L-7w")
            assert r1.status_code == 200
            assert r1.json()["id"] == "4NRXx6U8ABQ"
            assert mock_mig.call_count == 1
            # Second call is served from cache
            r2 = client.get("/api-v2/migrate/saavn/8MT-L-7w")
            assert r2.status_code == 200
            assert mock_mig.call_count == 1


def test_trending_filters_spotify_charts():
    fake_charts = {
        "songs": {
            "items": [
                {"videoId": "11111111111", "title": "Spotify Top 50 Global Chart", "artists": [{"name": "Chart Mix"}]},
                {"videoId": "4NRXx6U8ABQ", "title": "Blinding Lights", "artists": [{"name": "The Weeknd"}], "duration": "3:20"},
            ]
        }
    }
    fake_ytm = types.SimpleNamespace(get_charts=lambda country="IN": fake_charts)
    with patch.object(v2, "get_ytmusic", return_value=fake_ytm):
        with TestClient(v2.app) as client:
            res = client.get("/api-v2/trending?country=IN&limit=10")
            assert res.status_code == 200
            items = res.json()["results"]
            assert len(items) == 1
            assert items[0]["id"] == "4NRXx6U8ABQ"


def test_format_timed_lyrics_converts_ms_to_lrc():
    lines = [
        {"text": "First line", "start_time": 9200, "end_time": 11000},
        {"text": "Second line", "start_time": 65430, "end_time": 69000},
    ]
    out = v2._format_timed_lyrics(lines)
    assert out == "[00:09.20] First line\n[01:05.43] Second line"


def test_cap_range_header_supports_ios_and_vercel_chunks():
    assert v2._cap_range_header(None, max_bytes=1024) == "bytes=0-1023"
    assert v2._cap_range_header("bytes=0-", max_bytes=1024) == "bytes=0-1023"
    assert v2._cap_range_header("bytes=0-1", max_bytes=1024) == "bytes=0-1"
    assert v2._cap_range_header("bytes=1024-", max_bytes=1024) == "bytes=1024-2047"
    assert v2._cap_range_header("bytes=0-99999", max_bytes=1024) == "bytes=0-1023"


def test_artwork_normalization_forces_square_google_crop_and_prefers_letterbox_free_ytimg():
    assert (
        v2._normalize_artwork_url("http://lh3.googleusercontent.com/abc=w544-h544-l90-rj")
        == "https://lh3.googleusercontent.com/abc=w544-h544-c-l90-rj"
    )
    assert (
        v2._normalize_artwork_url("https://yt3.googleusercontent.com/xyz=w1280-h720-c-l90-rj")
        == "https://yt3.googleusercontent.com/xyz=w544-h544-c-l90-rj"
    )
    assert (
        v2._normalize_artwork_url("https://lh3.googleusercontent.com/bare")
        == "https://lh3.googleusercontent.com/bare=w544-h544-c-l90-rj"
    )

    thumbs = [
        {"url": "https://i.ytimg.com/vi/abc12345678/hqdefault.jpg", "width": 480, "height": 360},
        {"url": "https://i.ytimg.com/vi/abc12345678/hq720.jpg", "width": 1280, "height": 720},
    ]
    assert v2._pick_best_thumbnail(thumbs) == "https://i.ytimg.com/vi/abc12345678/hq720.jpg"


def test_cookies_b64_and_pot_provider_opts(monkeypatch):
    import base64
    encoded = base64.b64encode(b"# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\txyz\n").decode()
    monkeypatch.setenv("YTDLP_COOKIES_B64", encoded)
    monkeypatch.setenv("YTDLP_PO_TOKEN", "web.gvs+abc123")
    monkeypatch.setenv("YTDLP_POT_PROVIDER_URL", "http://127.0.0.1:4416")
    opts = v2._base_opts(player_client=["mweb"], include_cookies=True)
    assert opts["extractor_args"]["youtube"]["po_token"] == ["web.gvs+abc123"]
    assert opts["extractor_args"]["youtubepot-bgutilhttp"]["base_url"] == ["http://127.0.0.1:4416"]
    assert os.path.exists(opts["cookiefile"])


def test_stream_backend_redirect_and_config(monkeypatch):
    monkeypatch.setattr(v2, "STREAM_BACKEND_URL", "https://stream.example.com")
    with TestClient(v2.app) as client:
        cfg = client.get("/api-v2/config")
        assert cfg.status_code == 200
        assert cfg.json()["stream_base_url"] == "https://stream.example.com"
        assert cfg.json()["stream_ready"] is True

        redir = client.get("/api-v2/stream/dQw4w9WgXcQ", follow_redirects=False)
        assert redir.status_code == 307
        assert redir.headers["location"] == "https://stream.example.com/api-v2/stream/dQw4w9WgXcQ"
        assert "no-store" in redir.headers["cache-control"]


def test_saavn_audio_bridge_matches_standard_track_and_guards_mashups():
    assert v2._is_derivative_title("Levitating Mashup (Slowed)") is True
    assert v2._is_derivative_title("Laal Pari") is False

    meta = v2.Track(
        id="FXxuVh9KIPs",
        title="Laal Pari",
        artist="Yo Yo Honey Singh, Simar Kaur",
        artwork="https://yt3.googleusercontent.com/abc=w544-h544-c-l90-rj",
        duration=256,
        source="youtube",
    )
    fake_payload = {
        "data": {
            "results": [
                {
                    "name": "Laal Pari (From \"Housefull 5\")",
                    "duration": 256,
                    "artists": {"primary": [{"name": "Yo Yo Honey Singh"}, {"name": "Simar Kaur"}]},
                    "downloadUrl": [{"quality": "320kbps", "url": "https://aac.saavncdn.com/test/laal_pari_320.mp4"}],
                    "image": [{"quality": "500x500", "url": "https://c.saavncdn.com/test/laal_pari_500x500.jpg"}],
                }
            ]
        }
    }

    class FakeResp:
        status_code = 200
        def json(self):
            return fake_payload

    class FakeClient:
        def __init__(self, *a, **kw):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def get(self, *a, **kw):
            return FakeResp()

    with patch.object(v2.httpx, "Client", FakeClient):
        info, err = v2._resolve_saavn_bridge_sync("FXxuVh9KIPs", meta)
        assert err is None
        assert info is not None
        assert info.url.endswith("laal_pari_320.mp4")
        assert info.content_type == "audio/mp4"
        assert info.artwork == meta.artwork

        remix_meta = v2.Track(
            id="x1y2z3a4b5c",
            title="Laal Pari x Espresso Mashup",
            artist="DJ Mix",
            artwork="https://i.ytimg.com/vi/x1y2z3a4b5c/hq720.jpg",
            duration=210,
            source="youtube",
        )
        rejected_info, rejected_err = v2._resolve_saavn_bridge_sync("x1y2z3a4b5c", remix_meta)
        assert rejected_info is None
        assert rejected_err is not None

        vevo_meta = v2.Track(
            id="4NRXx6U8ABQ",
            title="The Weeknd - Blinding Lights (Official Video)",
            artist="TheWeekndVEVO",
            artwork="https://i.ytimg.com/vi/4NRXx6U8ABQ/hq720.jpg",
            duration=204,
            source="youtube",
        )
        assert v2._normalize_artist_hint(vevo_meta.artist) == "The Weeknd"
