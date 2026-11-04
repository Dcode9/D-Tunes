# D'Tunes WhatsApp Status feature video (v7)

Source for the 30.09s, 1080x1920, 24fps vertical video: five feature scenes, the "Get D'Tunes" card, then the D'Verse ending. Nothing here is a secret. No SFX.

## Rebuild
Needs google-chrome, python3 with numpy and Pillow, and ffmpeg. Run from this folder:

    ./build.sh /path/to/soundtrack.mp3 out.mp4

The soundtrack (the user's own MP3, 54.12s, file audio-3ae9e05b.mp3) is not stored in the repo. build.sh applies: first 30.09s, 0.1s fade in, fade out 23.09-30.09, loudnorm I=-15 TP=-1.5 LRA=11 (about -14 LUFS measured).

## Files
- `t0.html` to `t6.html`: transparent text layers (intro, five headlines, Get D'Tunes card). Plus Jakarta Sans and Inter, loaded from the font files here.
- `s1.webp`, `s2.webp`, `s5.webp`, `s6.webp`, `s7.webp`: feature objects (headphones, record, cards, Vibe Mix orb, phone download). `bplate_phone.png`: background plate. `icon_color.png`: colored D'Tunes mark.
- `render_video.py`: composes every frame (motion, timing, ending). Timeline: intro 0-5.09, Ad-free 5.09, High-quality audio 7.09, Custom recommendations 10.09, Vibe Mix 13.09, Offline 15.09, Get D'Tunes card 18.09, store buttons 20.09, D'Verse ending from 24.3, fade to black by 30.09. Entrances rise from below with ease-out and leave upward. Cuts are tied to the soundtrack.
- `beam.html`: the D'Verse ending, `?t=<seconds>`. The beam is the sweep from the old D-UI `CanvasFluidLightEngine.tsx` (Dcode9/D-UI): a white/silver-blue glow enters at the right edge about 24.55s, sweeps to the left edge over 1.8s with quadratic ease-in-out, and widens from a thin beam (spread 6vw, blur 71) to a large glow (73vw, blur 80), same gradient stops. `'Verse` fades in; the `D` forms as the beam reaches the left edge; from about 26.35s the glow shrinks and moves into the D. The sweep is mid-way at 25.59s (4.5s before the end).
- `build.sh`: runs the steps above.

Notes
- Scenes show Vibe Mix and offline as "Windows & web" only, not Android.
- No "free" or bitrate claims.

## Reproducibility
Verified: a clean rebuild from these files and the MP3 `audio-3ae9e05b.mp3` (54.12s) gave a byte-identical MP4 (sha256 9892f39bcd6c121ef85f5a5c7cc626d1928188d49b1b1adfb7d00bec6c7d532b) with Chrome 156.0.8078.47, ffmpeg 4.4.2, Pillow 12.3.0, numpy 2.2.6. Other versions may differ slightly. See GUIDE.html for the steps.

## Later source variants

The original v7 source and build entry point above match the video delivered in this chat. Later laptop-produced variants are preserved as full source snapshots under `versions/v8/`, `versions/v9/` and `versions/v9-beat-sync/`, each with its own build instructions. Run each variant from its own directory. These are separate versions, not evidence that a later render replaces the delivered v7. No app UI or marketing deployment is made by storing these sources. The soundtrack is not included in any version.
