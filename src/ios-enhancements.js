/**
 * D-Tunes iOS Enhancements
 * - Aave Glass-inspired design helpers
 * - Web Haptics by Lochie (vanilla implementation)
 *
 * https://github.com/lochie/web-haptics
 * https://aave.com/design/building-glass-for-the-web
 */

(function () {
  'use strict';

  const defaultPatterns = {
    success: [{ duration: 50 }, { delay: 50, duration: 50 }],
    warning: [{ duration: 50, intensity: 0.6 }, { delay: 60, duration: 80, intensity: 0.9 }],
    error: [
      { duration: 50, intensity: 0.75 },
      { delay: 40, duration: 50, intensity: 0.75 },
      { delay: 40, duration: 50, intensity: 0.75 }
    ],
    light: [{ duration: 40, intensity: 0.4 }],
    medium: [{ duration: 50, intensity: 0.7 }],
    heavy: [{ duration: 60, intensity: 1 }],
    soft: [{ duration: 80, intensity: 0.3 }],
    rigid: [{ duration: 30, intensity: 0.9 }],
    selection: [{ duration: 25, intensity: 0.5 }],
    nudge: [
      { duration: 80, intensity: 0.8 },
      { delay: 80, duration: 50, intensity: 0.3 }
    ],
    buzz: [{ duration: 1000, intensity: 1 }]
  };

  function intensityToVibrate(pattern) {
    if (typeof pattern === 'number') return [pattern];
    if (Array.isArray(pattern) && typeof pattern[0] === 'number') return pattern;

    const result = [];
    let lastWasDelay = false;
    pattern.forEach((p, i) => {
      if (p.delay && !lastWasDelay) {
        result.push(0);
        result.push(p.delay);
        lastWasDelay = true;
      }
      const dur = Math.max(10, Math.round((p.duration || 50) * (p.intensity != null ? 0.5 + p.intensity * 0.5 : 1)));
      if (lastWasDelay || i === 0) {
        result.push(dur);
      } else {
        result.push(0);
        result.push(dur);
      }
      lastWasDelay = false;
    });
    return result;
  }

  class WebHaptics {
    constructor(options = {}) {
      this.debug = !!options.debug;
      this.enabled = true;
    }

    isSupported() {
      return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    }

    async trigger(input) {
      if (!this.enabled || !this.isSupported()) return;

      let pattern;
      if (input == null || input === '') {
        pattern = defaultPatterns.medium;
      } else if (typeof input === 'string' && defaultPatterns[input]) {
        pattern = defaultPatterns[input];
      } else if (typeof input === 'number' || Array.isArray(input)) {
        pattern = input;
      } else if (input && input.pattern) {
        pattern = input.pattern;
      } else {
        pattern = defaultPatterns.medium;
      }

      const vibratePattern = intensityToVibrate(pattern);
      try {
        navigator.vibrate(0);
        navigator.vibrate(vibratePattern);
      } catch (e) {}
    }

    setEnabled(val) {
      this.enabled = !!val;
    }
  }

  window.webHaptics = new WebHaptics({ debug: false });
  window.triggerHaptic = function (type) {
    return window.webHaptics.trigger(type || 'medium');
  };

  function wireHaptics() {
    document.querySelectorAll('[onclick*="togglePlay"], #btn-play, .play-btn, [data-action="play"]').forEach((el) => {
      el.addEventListener('click', () => window.triggerHaptic('medium'), { passive: true });
    });

    document.querySelectorAll('[onclick*="like"], .like-btn, [data-action="like"]').forEach((el) => {
      el.addEventListener('click', () => window.triggerHaptic('success'), { passive: true });
    });

    document.querySelectorAll('#mobile-nav button, [data-view], .nav-item').forEach((el) => {
      el.addEventListener('click', () => window.triggerHaptic('selection'), { passive: true });
    });

    document.querySelectorAll('button').forEach((el) => {
      if (!el.hasAttribute('data-haptic-wired')) {
        el.setAttribute('data-haptic-wired', '1');
        el.addEventListener('click', () => {
          if (!el.closest('#eq-modal-bands')) window.triggerHaptic('light');
        }, { passive: true });
      }
    });

    const seek = document.getElementById('seek-bar-container');
    if (seek) {
      seek.addEventListener('pointerdown', () => window.triggerHaptic('rigid'), { passive: true });
    }

    document.body.addEventListener('click', (e) => {
      if (e.target.closest('.song-pill, .scroll-card, .for-you-card')) {
        window.triggerHaptic('selection');
      }
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(wireHaptics, 800));
  } else {
    setTimeout(wireHaptics, 800);
  }

  setInterval(() => {
    document.querySelectorAll('button:not([data-haptic-wired])').forEach((btn) => {
      btn.setAttribute('data-haptic-wired', '1');
      btn.addEventListener('click', () => {
        if (!btn.closest('#eq-modal-bands')) window.triggerHaptic('light');
      }, { passive: true });
    });
  }, 3000);

  function enhanceGlassElements() {
    document.querySelectorAll('.glass-panel, #player-card, #mobile-nav, header.glass-panel, .song-pill').forEach((el) => {
      if (!el.classList.contains('aave-glass')) {
        el.classList.add('aave-glass');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(enhanceGlassElements, 400));
  } else {
    setTimeout(enhanceGlassElements, 400);
  }

  const observer = new MutationObserver(() => enhanceGlassElements());
  observer.observe(document.body, { childList: true, subtree: true });

  console.info('[D-Tunes iOS] Aave Glass + Web Haptics (Lochie) enhancements loaded');
})();
