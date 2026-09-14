/**
 * D-Tunes iOS Enhancements
 * - Aave Glass-inspired design helpers (visual polish on existing glass system)
 * - Web Haptics by Lochie (vanilla implementation of the patterns)
 *
 * https://github.com/lochie/web-haptics
 * https://aave.com/design/building-glass-for-the-web
 */

(function () {
  'use strict';

  // ---------- Web Haptics (Lochie-inspired vanilla) ----------
  // Patterns adapted from web-haptics presets. Uses Vibration API.
  // Silently no-ops where unsupported (desktop / some iOS versions without vibration).

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
    // Approximate intensity via duration scaling (Vibration API has no true intensity on most platforms)
    if (typeof pattern === 'number') return [pattern];
    if (Array.isArray(pattern) && typeof pattern[0] === 'number') return pattern;

    const result = [];
    let lastWasDelay = false;
    pattern.forEach((p, i) => {
      if (p.delay && !lastWasDelay) {
        result.push(0); // off period
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

    async trigger(input, options = {}) {
      if (!this.enabled || !this.isSupported()) {
        if (this.debug) console.log('[WebHaptics] skipped', input);
        return;
      }

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
        navigator.vibrate(0); // cancel previous
        navigator.vibrate(vibratePattern);
        if (this.debug) console.log('[WebHaptics]', input, vibratePattern);
      } catch (e) {
        if (this.debug) console.warn('[WebHaptics] error', e);
      }
    }

    setEnabled(val) {
      this.enabled = !!val;
    }
  }

  // Global instance
  window.webHaptics = new WebHaptics({ debug: false });

  // Convenience
  window.triggerHaptic = function (type) {
    return window.webHaptics.trigger(type || 'medium');
  };

  // ---------- Auto-wire common interactions ----------
  function wireHaptics() {
    // Play / Pause buttons
    document.querySelectorAll('[onclick*="togglePlay"], #btn-play, .play-btn, [data-action="play"]').forEach((el) => {
      el.addEventListener('click', () => window.triggerHaptic('medium'), { passive: true });
    });

    // Like / heart
    document.querySelectorAll('[onclick*="like"], .like-btn, [data-action="like"]').forEach((el) => {
      el.addEventListener('click', () => window.triggerHaptic('success'), { passive: true });
    });

    // Navigation / tabs
    document.querySelectorAll('#mobile-nav button, [data-view], .nav-item').forEach((el) => {
      el.addEventListener('click', () => window.triggerHaptic('selection'), { passive: true });
    });

    // Generic primary buttons
    document.querySelectorAll('button.bg-\\[var\\(--accent-color\\)\\], .primary-btn, button[class*="bg-[var(--accent-color)]"]').forEach((el) => {
      el.addEventListener('click', () => window.triggerHaptic('light'), { passive: true });
    });

    // Modal open / close feel
    document.querySelectorAll('[onclick*="Modal"], [onclick*="toggle"]').forEach((el) => {
      el.addEventListener('click', () => window.triggerHaptic('soft'), { passive: true });
    });

    // Seek bar interaction (pointer)
    const seek = document.getElementById('seek-bar-container');
    if (seek) {
      seek.addEventListener('pointerdown', () => window.triggerHaptic('rigid'), { passive: true });
    }

    // Song pills / cards
    document.body.addEventListener(
      'click',
      (e) => {
        if (e.target.closest('.song-pill, .scroll-card, .for-you-card')) {
          window.triggerHaptic('selection');
        }
      },
      { passive: true }
    );
  }

  // Run after DOM ready + a short delay so dynamic UI is present
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(wireHaptics, 800));
  } else {
    setTimeout(wireHaptics, 800);
  }

  // Re-wire periodically for dynamically rendered content (lightweight)
  setInterval(() => {
    // Only attach if not already flagged
    document.querySelectorAll('button:not([data-haptic-wired])').forEach((btn) => {
      btn.setAttribute('data-haptic-wired', '1');
      btn.addEventListener(
        'click',
        () => {
          // Light default for any remaining buttons
          if (!btn.closest('#eq-modal-bands')) window.triggerHaptic('light');
        },
        { passive: true }
      );
    });
  }, 3000);

  // ---------- Aave Glass visual helpers ----------
  // Adds subtle specular + rim light classes so existing .glass-panel elements
  // feel closer to Aave Glass / Liquid Glass on iOS Safari.
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

  // Observe for new modals / panels
  const observer = new MutationObserver(() => enhanceGlassElements());
  observer.observe(document.body, { childList: true, subtree: true });

  console.info('[D-Tunes iOS] Aave Glass + Web Haptics (Lochie) enhancements loaded');
})();
