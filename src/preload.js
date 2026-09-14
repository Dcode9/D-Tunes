(function() {
            window.__dtunesDetectMobileBrowser = function() {
                const ua = navigator.userAgent || '';
                const hasTouch = (navigator.maxTouchPoints || 0) > 0;
                const uaDataMobile = !!(navigator.userAgentData && navigator.userAgentData.mobile);
                const desktopRequestUA = (
                    /(Windows NT|X11; Linux x86_64|CrOS)/i.test(ua) ||
                    (/(Macintosh)/i.test(ua) && !hasTouch)
                ) && !/(Android|iPhone|iPad|iPod)/i.test(ua);
                const hasMobileToken = /(android|iphone|ipod|ipad|iemobile|opera mini|mobile|blackberry|windows phone)/i.test(ua);
                const coarsePointer = !!(window.matchMedia && (window.matchMedia('(any-pointer: coarse)').matches || window.matchMedia('(pointer: coarse)').matches));
                const noHover = !!(window.matchMedia && window.matchMedia('(any-hover: none)').matches);
                const shortestViewport = Math.min(window.innerWidth || 0, window.innerHeight || 0);
                const shortestScreen = Math.min(window.screen?.width || shortestViewport, window.screen?.height || shortestViewport);
                const likelyHandheld = hasTouch && (coarsePointer || noHover) && (shortestViewport <= 1024 || shortestScreen <= 1366);

                if (uaDataMobile) return true;
                if (desktopRequestUA) return false;
                if (hasMobileToken) return true;
                if (likelyHandheld) return true;
                return false;
            };

            window.__dtunesResolveUiMode = function() {
                const detectedMobile = window.__dtunesDetectMobileBrowser();
                return {
                    mode: detectedMobile ? 'mobile' : 'desktop',
                    preference: 'browser',
                    detectedMobile
                };
            };

            const initialUiMode = window.__dtunesResolveUiMode();
            document.documentElement.setAttribute('data-ui-mode', initialUiMode.mode);
            document.documentElement.setAttribute('data-ui-preference', initialUiMode.preference);
            document.documentElement.setAttribute('data-ui-detected-mobile', initialUiMode.detectedMobile ? '1' : '0');

            // Dynamically load Real Aave Glass + Web Haptics after the main app scripts
            function loadScript(src) {
                return new Promise(function(resolve, reject) {
                    var s = document.createElement('script');
                    s.src = src;
                    s.async = false;
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            }

            window.addEventListener('DOMContentLoaded', function() {
                // Wait for app.js etc to be present, then load glass
                setTimeout(function() {
                    loadScript('src/aave-glass.js')
                        .then(function() { return loadScript('src/ios-enhancements.js'); })
                        .then(function() { console.info('[D-Tunes] Aave Glass + Haptics loaded'); })
                        .catch(function(e) { console.warn('[D-Tunes] Glass load failed', e); });
                }, 300);
            });
        })();
