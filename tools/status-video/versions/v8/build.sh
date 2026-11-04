#!/bin/bash
# Rebuilds the D'Tunes WhatsApp Status video (1080x1920, 24fps, 30.09s). See README.md.
# Needs: Google Chrome, python3 (standard library only), ffmpeg.
# Usage: ./build.sh /path/to/audio-3ae9e05b.mp3 out.mp4
set -e
exec python3 "$(dirname "$0")/build.py" "$@"
