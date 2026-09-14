/**
 * D-Tunes iOS Enhancements
 * Aave Glass design language + Web Haptics by Lochie
 * https://aave.com/design/building-glass-for-the-web
 * https://github.com/lochie/web-haptics
 */
(function () {
  'use strict';

  const defaultPatterns = {
    success: [{ duration: 50 }, { delay: 50, duration: 50 }],
    warning: [{ duration: 50, intensity: 0.6 }, { delay: 60, duration: 80, intensity: 0.9 }],
    error: [{ duration: 50, intensity: 0.75 }, { delay: 40, duration: 50, intensity: 0.75 }, { delay: 40, duration: 50, intensity: 0.75 }],
    light: [{ duration: 40, intensity: 0.4 }],
    medium: [{ duration: 50, intensity: 0.7 }],
    heavy: [{ duration: 60, intensity: 1 }],
    soft: [{ duration: 80, intensity: 0.3 }],
    rigid: [{ duration: 30, intensity: 0.9 }],
    selection: [{ duration: 25, intensity: 0.5 }],
    nudge: [{ duration: 80, intensity: 0.8 }, { delay: 80, duration: 50, intensity: 0.3 }],
    buzz: [{ duration: 1000, intensity: 1 }]
  };

  function intensityToVibrate(pattern) {
    if (typeof pattern === 'number') return [pattern];
    if (Array.isArray(pattern) && typeof pattern[0] === 'number') return pattern;
    const result = [];
    let lastWasDelay = false;
    pattern.forEach((p, i) => {
      if (p.delay && !lastWasDelay) { result.push(0); result.push(p.delay); lastWasDelay = true; }
      const dur = Math.max(10, Math.round((p.duration || 50) * (p.intensity != null ? 0.5 + p.intensity * 0.5 : 1)));
      if (lastWasDelay || i === 0) result.push(dur);
      else { result.push(0); result.push(dur); }
      lastWasDelay = false;
    });
    return result;
  }

  class WebHaptics {
    constructor() { this.enabled = true; }
    isSupported() { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; }
    async trigger(input) {
      if (!this.enabled || !this.isSupported()) return;
      let pattern = defaultPatterns.medium;
      if (typeof input === 'string' && defaultPatterns[input]) pattern = defaultPatterns[input];
      else if (typeof input === 'number' || Array.isArray(input)) pattern = input;
      try { navigator.vibrate(0); navigator.vibrate(intensityToVibrate(pattern)); } catch (e) {}
    }
  }

  window.webHaptics = new WebHaptics();
  window.triggerHaptic = (type) => window.webHaptics.trigger(type || 'medium');

  function wire() {
    const add = (sel, type) => document.querySelectorAll(sel).forEach(el => el.addEventListener('click', () => triggerHaptic(type), { passive: true }));
    add('[onclick*="togglePlay"], #btn-play, .play-btn', 'medium');
    add('[onclick*="like"], .like-btn', 'success');
    add('#mobile-nav button, [data-view]', 'selection');
    document.body.addEventListener('click', e => { if (e.target.closest('.song-pill, .scroll-card')) triggerHaptic('selection'); }, { passive: true });
    const seek = document.getElementById('seek-bar-container');
    if (seek) seek.addEventListener('pointerdown', () => triggerHaptic('rigid'), { passive: true });
  }

  function enhanceGlass() {
    document.querySelectorAll('.glass-panel, #player-card, #mobile-nav, header.glass-panel, .song-pill').forEach(el => el.classList.add('aave-glass'));
  }

  const boot = () => { setTimeout(wire, 600); setTimeout(enhanceGlass, 400); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  new MutationObserver(enhanceGlass).observe(document.body, { childList: true, subtree: true });
  console.info('[D-Tunes iOS] Aave Glass + Web Haptics ready');
})();
