# D'Tunes WhatsApp Status feature video (v9)

Source for the 30.09s, 1080x1920, 24fps vertical video: intro, five feature scenes, the "Get D'Tunes" card, then the D'Verse ending. Nothing here is a secret. No SFX.

## Rebuild
Needs Google Chrome, python3 (standard library only) and ffmpeg. From any folder:

    ./build.sh /path/to/audio-3ae9e05b.mp3 out.mp4        # or: python3 build.py ...

About 6 minutes. The soundtrack (the user's own MP3, 54.12s, file audio-3ae9e05b.mp3) is not stored in the repo. The build applies: first 30.09s, 0.1s fade in, fade out 23.09-30.09, loudnorm I=-15 TP=-1.5 LRA=11. Chrome is found on PATH or in the usual install folders; set `CHROME=/path/to/chrome` to override.

Look at single moments without a full build:

    python3 build.py --at 1.0,6.2,25.9        # writes frames/0024.jpg, ...

or serve this folder (`python3 -m http.server`) and open `scene.html?t=25.9` in Chrome.

## How it works
- `scene.js` draws every frame on one 1080x1920 canvas as a pure function of the frame index (`renderFrame(i)`), so a build is deterministic. `build.py` loads `scene.html` in headless Chrome, captures each frame over the DevTools protocol, then muxes with ffmpeg (x264 CRF 18, `aq-mode=3` against banding in the dark gradients).
- Motion follows the classic animation principles: every move is pose to pose with anticipation and overshoot (back curves, damped springs), slow in/slow out, travels along an arc, and is motion-blurred over a 180-degree shutter (sub-frame samples, not a Gaussian blur). Moving objects stretch along their path and bank into it; size lags position (follow-through); text units overlap in staggered waves. Nothing pulses on the beat; the big moves are placed on the music instead.
- Objects: all five feature objects live on one pose timeline (`OBJS` in `scene.js`). On the build at 2.96s the mark pulls back and collapses, and the objects burst out of it: the headphones land centre stage, the others park out of focus at their own spots on the edge of frame. On each cut the outgoing object flies back to its spot and the next one comes in from its spot. At 18.09 they all collapse back into the mark.
- Type: Plus Jakarta Sans at real weights (700/800; the variable font stops at 800, so nothing is synthesised) and Inter. Two layers per scene, headline and subtitle. Headlines are light brushed silver with a clean 1px rim (glyph mask minus its erosion, so the variable font's overlapping contours never show) and a top-edge catch; one specular band crosses each headline once, left to right, carrying the bloom and a thin amber/cyan fringe.
- Card: the mark lands centred with "Get D'Tunes" under it, the pair lifts, and two store buttons follow: Android / Google Play (primary) and Windows / Microsoft Store, each with its store logo (drawn as vectors) and link (tunes.d-verse.in/android, tunes.d-verse.in/windows).
- D'Verse ending: a port of the deployed D'Verse page (D-UI `CanvasFluidLightEngine.tsx` + `WwdcTextEffect.tsx`, commit c00d9b5). The loading ribbon starts at the middle of the left edge at 23.3s and runs the frame edge at the engine's own speed (0.25x0.8 perimeters/s, corner boost 1.3), then eases to a stop at the middle of the right edge; the beam takes over there at rest and sweeps right to left over 1.4s (quadratic in-out, STATE_1 spread 6/origin 69/blur 71 widening to STATE_3 73/63/80), uncovering the type, and fades out as it reaches the left edge. The type is the WwdcTextEffect stack (dark body, edge specular, top catch, illumination, amber and cyan fringes, incandescent core with 4/16/36px bloom, apex filament) lit by letter: full light through the first `e`, the falloff across the `r`, `s` and `e` plain. Fade to black 29.35-30.09.

Timeline: intro 0-2.96, burst 2.96-4.4, Ad-free 5.09, High-quality audio 7.09, Custom recommendations 10.09, Vibe Mix 12.42, Offline 15.09, Get D'Tunes card 18.09, store buttons 20.09, D'Verse ribbon 23.3, sweep 26.01-27.41.

## Files
- `scene.html`, `scene.js`: the composition (timing in `SCN`, `OBJS` and the constants above them; copy in `SC`, `intro`, `card` and `boot`).
- `build.py`, `build.sh`: render + encode.
- `s1.webp`, `s2.webp`, `s5.webp`, `s6.webp`, `s7.webp`: feature objects (headphones, record, cards, Vibe Mix orb, phone download). `bplate_phone.png`: background light plate. `icon_color.png`: colored D'Tunes mark. `PlusJakartaSansVar.woff2`, `Inter.ttf`: fonts.
- `GUIDE.html`: step-by-step import/rebuild guide.

Notes
- Scenes show Vibe Mix and offline as "Windows & web" only, not Android.
- No "free" or bitrate claims.

## Reproducibility
Rendering is deterministic for a given Chrome and ffmpeg build. The delivered v9 file (12.7 MB) was built on Windows with Chrome 156.0.8078.80 and ffmpeg N-125365-g9a01c1cb6a: sha256 b540f35122202d04676dfcbef97181ec2be8a0ad4e185eb5d165e2ac4c2f2bfe. Other Chrome versions can differ by a few pixels (text antialiasing, blur kernels); compare by eye, especially the ending.
