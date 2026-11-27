# D'Tunes Dedicated Streaming Backend

Deploy this service on a non-blocked host (VPS, Railway, Render, or Fly.io) so `/api-v2/stream/{video_id}` and `/api-v2/resolve/{video_id}` run with real cookies, PO-token generation (`bgutil-ytdlp-pot-provider`), Node.js signature solving, and full HTTP `206` byte-range streaming for iPhone Safari.

## Quick Start (Docker Compose)

1. Copy `.env.example` to `.env` in this folder and add `YTDLP_COOKIES_B64` (optional, recommended).
2. From `deploy/stream-backend`, run:
   ```bash
   docker compose up -d --build
   ```
3. Put HTTPS in front of port `8000` (Caddy, Nginx, Cloudflare Tunnel, or your host's built-in HTTPS domain, e.g. `https://stream.d-verse.in`).
4. In Vercel Project Settings -> Environment Variables, set:
   ```text
   STREAM_BACKEND_URL=https://stream.d-verse.in
   ```
   D'Tunes on Vercel will automatically advertise that URL via `/api-v2/health` and `/api-v2/config` so the browser streams audio directly from your dedicated host without hitting Vercel's 4.5 MB limit or datacenter IP blocks.
