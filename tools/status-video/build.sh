#!/bin/bash
# Rebuilds the D'Tunes WhatsApp Status feature video (1080x1920, 24fps, 30.09s).
# Needs: google-chrome, python3 (numpy, Pillow), ffmpeg. Run from this folder.
# Usage: ./build.sh /path/to/soundtrack.mp3 out.mp4
set -e
MP3="${1:?path to the soundtrack mp3}"; OUT="${2:-dtunes_status_feature_video.mp4}"
# 1. headline/text layers (transparent 1080x1920 PNGs): t0..t6
for n in 0 1 2 3 4 5 6; do
  google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --window-size=1080,1920 --screenshot="$PWD/t$n.png" "file://$PWD/t$n.html" >/dev/null 2>&1
done
# 2. D'Verse ending: beam sweep frames 583..692 (24.3s-28.8s). Run sequentially (Chrome profile locks).
mkdir -p beam_frames
for i in $(seq 583 692); do
  t=$(python3 -c "print($i/24)")
  google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1080,1000 \
    --virtual-time-budget=2000 --screenshot="$PWD/beam_frames/$(printf %04d $i).png" "file://$PWD/beam.html?t=$t" >/dev/null 2>&1
done
# 3. all frames
mkdir -p frames && python3 render_video.py 0 722
# 4. soundtrack: exactly the first 30.09s of the supplied MP3 (54.12s, "audio-3ae9e05b.mp3"), 0.1s fade in, fade out 23.09-30.09, loudnorm. No SFX.
ffmpeg -y -v error -ss 0 -t 30.09 -i "$MP3" -af "aresample=44100,afade=t=in:d=0.1,afade=t=out:st=23.09:d=7.0,loudnorm=I=-15:TP=-1.5:LRA=11" mix.wav
ffmpeg -y -v error -framerate 24 -i frames/%04d.jpg -i mix.wav -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
