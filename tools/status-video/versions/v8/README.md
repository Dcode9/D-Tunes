# D'Tunes WhatsApp Status feature video (v8)

Source for the 30.09s, 1080x1920, 24fps vertical video: intro, five feature scenes, the "Get D'Tunes" card, then the D'Verse ending. Nothing here is a secret. No SFX.

## Rebuild
Needs Google Chrome, python3 (standard library only) and ffmpeg. From any folder:

    ./build.sh /path/to/audio-3ae9e05b.mp3 out.mp4        # or: python3 build.py ...

About 7 minutes. The soundtrack (the user's own MP3, 54.12s, file audio-3ae9e05b.mp3) is not stored in the repo. The build applies: first 30.09s, 0.1s fade in, fade out 23.09-30.09, loudnorm I=-15 TP=-1.5 LRA=11. Chrome is found on PATH or in the usual install folders; set `CHROME=/path/to/chrome` to override.

Look at single moments without a full build:

    python3 build.py --at 1.0,6.2,25.9        # writes frames/0024.jpg, ...

or serve this folder (`python3 -m http.server`) and open `scene.html?t=25.9` in Chrome.

## How it works
- `scene.js` draws every frame on one 1080x1920 canvas as a pure function of the frame index (`renderFrame(i)`), so a build is deterministic. `build.py` loads `scene.html` in headless Chrome, captures each frame over the DevTools protocol, then muxes with ffmpeg (x264 CRF 16, `aq-mode=3` against banding in the dark gradients).
- Type: Plus Jakarta Sans at real weights (700/800; the variable font stops at 800, so nothing is synthesised) and Inter. Headlines use a brushed-silver material: a Gaussian hot-spot of light that sweeps in with each cut, a clean 1px rim (glyph mask minus its erosion, so the variable font's overlapping contours never show), a top-edge catch, an amber/cyan fringe that follows the light, and a bloom weighted toward it. Words (letters for the brand names) rise through their own line window with blur and stagger, and leave upward the same way.
- Motion: objects enter on a damped spring (a different move per scene: rise, slide, fan, burst, drop), float, push in slowly, catch a glass glint, and leave with a zoom-through blur that hands over to the next scene. Each cut is covered by a thin D'Verse beam crossing the frame. Glow, objects and buttons pulse on the soundtrack's strong onsets (`HITS` in `scene.js`). Light film grain over everything.
- D'Verse ending: a port of the deployed D'Verse page (D-UI `CanvasFluidLightEngine.tsx` + `WwdcTextEffect.tsx`, commit c00d9b5). The loading ribbon starts at the middle of the left edge at 23.3s, runs the frame edge at the engine's own speed (0.25x0.8 perimeters/s, corner boost 1.3) and docks at the middle of the right edge at 25.49s; the beam then sweeps right to left over 1.4s (quadratic in-out, STATE_1 spread 6/origin 69/blur 71 widening to STATE_3 73/63/80), uncovering the type behind it, and rests at the left edge. The type is the full WwdcTextEffect stack (dark body, edge specular, top catch, directional light at 18%, opposite rim, amber and cyan fringes, incandescent core with 4/16/36px bloom, apex filament, plus the amber/white/cyan halos), with every gradient Gaussian-smoothed so the light rolls off evenly from letter to letter. Fade to black 29.35-30.09.

Timeline: intro 0-5.09, Ad-free 5.09, High-quality audio 7.09, Custom recommendations 10.09, Vibe Mix 13.09, Offline 15.09, Get D'Tunes card 18.09, store buttons 20.09, D'Verse ribbon 23.3, sweep 25.49-26.89. Cuts are tied to the soundtrack.

## Files
- `scene.html`, `scene.js`: the composition (all timing and motion at the top of the timeline section in `scene.js`; copy is in `SC` and the card/intro functions).
- `build.py`, `build.sh`: render + encode.
- `s1.webp`, `s2.webp`, `s5.webp`, `s6.webp`, `s7.webp`: feature objects (headphones, record, cards, Vibe Mix orb, phone download). `bplate_phone.png`: background light plate. `icon_color.png`: colored D'Tunes mark. `PlusJakartaSansVar.woff2`, `Inter.ttf`: fonts.
- `GUIDE.html`: step-by-step import/rebuild guide.

Notes
- Scenes show Vibe Mix and offline as "Windows & web" only, not Android.
- No "free" or bitrate claims.

## Reproducibility
Rendering is deterministic for a given Chrome and ffmpeg build. The delivered v8 file (15.0 MB) was built on Windows with Chrome 156.0.8078.80 and ffmpeg N-125365-g9a01c1cb6a: sha256 3243575e41bc80b66bdfaac66633301ebd44a35b4cc659b343461c751d8e4b24. Other Chrome versions can differ by a few pixels (text antialiasing, blur kernels); compare by eye, especially the ending.
