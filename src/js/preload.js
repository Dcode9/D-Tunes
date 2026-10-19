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

            // Single source of truth for "are we offline right now?". Network-backed
            // features ask this before attempting a request so an offline boot never
            // sits on a request until the browser's timeout fires.
            window.__dtunesIsOffline = function() {
                try {
                    if (typeof navigator !== 'undefined' && navigator && typeof navigator.onLine === 'boolean') {
                        return navigator.onLine === false;
                    }
                } catch (_) {}
                return false;
            };

            window.__dtunesIsOnline = function() {
                return !window.__dtunesIsOffline();
            };

            const initialUiMode = window.__dtunesResolveUiMode();
            document.documentElement.setAttribute('data-ui-mode', initialUiMode.mode);
            document.documentElement.setAttribute('data-ui-preference', initialUiMode.preference);
            document.documentElement.setAttribute('data-ui-detected-mobile', initialUiMode.detectedMobile ? '1' : '0');
        })();
