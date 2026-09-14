# D-Tunes — iOS / Aave Glass + Web Haptics Branch

This branch (`ios-aave-glass-haptics`) is an iOS-optimized version of D-Tunes focused on:

1. **Aave Glass-inspired design** for UI elements  
   Inspired by [Aave’s Building Glass for the Web](https://aave.com/design/building-glass-for-the-web) (their take on Apple’s Liquid Glass).  
   Existing `.glass-panel`, player, nav, modals and song pills receive deeper refraction-style treatment, specular highlights, rim lighting and improved Safari-friendly glass depth.

2. **Web Haptics by Lochie**  
   Lightweight vanilla implementation of the patterns from [lochie/web-haptics](https://github.com/lochie/web-haptics).  
   Provides tactile feedback on mobile (especially Android + capable iOS Safari / PWAs) for play/pause, likes, navigation, selection, seek, buttons and modals.

## What changed

- New file: `src/ios-enhancements.js`
  - `window.webHaptics` / `window.triggerHaptic(type)`
  - Presets: `success`, `warning`, `error`, `light`, `medium`, `heavy`, `soft`, `rigid`, `selection`, `nudge`, `buzz`
  - Auto-wires common controls + dynamic content
  - Adds `aave-glass` class to glass surfaces for the enhanced visual system

- Styles (`src/styles.css`): stronger liquid-glass look on `.aave-glass` / `.glass-panel` (specular gradient, brighter rim, deeper blur, better iOS Safari compositing).

- `index.html`: loads the enhancements script.

## Usage

```js
// Anywhere in the app
triggerHaptic('success');   // like / save
triggerHaptic('selection'); // tab / pill
triggerHaptic('medium');    // play/pause
triggerHaptic('rigid');     // seek start
```

## Running

Same as main:

```bash
npm start
# open http://localhost:3000
```

Add to home screen on iOS for the full PWA + haptic experience (where the Vibration API is available).

## Notes

- Full optical `feDisplacementMap` Aave Glass (live DOM refraction) is heavy and Safari-sensitive; this branch delivers the *design language* and tactile feel first, using performant CSS + the existing glass system.
- Haptics gracefully no-op on unsupported platforms.
- Future work can layer a true displacement-map component for selected controls (switches, sliders, player chrome) following Aave’s technique.

---

Branch created for the iOS-focused experience requested by the repo owner.
