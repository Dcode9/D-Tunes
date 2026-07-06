## 2024-05-23 - Visualizer DOM Update Redundancy
**Learning:** Found an anti-pattern in the visualizer where `canvas.style.clipPath` is updated unconditionally inside a `requestAnimationFrame` loop, even though the underlying value (`currentProgress`) updates far less frequently. This results in ~55 redundant DOM style updates per second, which forces unnecessary layout recalculations.
**Action:** Always memoize DOM attribute or style updates within high-frequency loops (like `requestAnimationFrame` or `scroll` event listeners) to ensure the DOM is only touched when the bound value has genuinely changed.
## 2026-07-06 - [Background Audio Transition on Mobile]

**Learning:** [Mobile browsers severely throttle or suspend `setInterval` and `setTimeout` when tabs are backgrounded or the screen is locked, leading to interrupted audio transitions if background play relies on them.]

**Action:** [Rely purely on native `ended` events for continuous audio playback and ensure the next track's `play()` call is synchronous inside the event listener when `document.visibilityState === 'hidden'` to maintain the OS background audio session lock.]
