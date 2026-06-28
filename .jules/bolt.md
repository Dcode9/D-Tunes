## 2024-05-23 - Visualizer DOM Update Redundancy
**Learning:** Found an anti-pattern in the visualizer where `canvas.style.clipPath` is updated unconditionally inside a `requestAnimationFrame` loop, even though the underlying value (`currentProgress`) updates far less frequently. This results in ~55 redundant DOM style updates per second, which forces unnecessary layout recalculations.
**Action:** Always memoize DOM attribute or style updates within high-frequency loops (like `requestAnimationFrame` or `scroll` event listeners) to ensure the DOM is only touched when the bound value has genuinely changed.
## 2024-05-18 - Sequential API Calls
**Learning:** Sequential API calls in loops block data loading unnecessarily when requests are independent.
**Action:** Use Promise.all to fetch independent data concurrently.
