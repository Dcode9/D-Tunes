        // ============================================
        // DYNAMIC PALETTE & AMBIENT THEME
        // ============================================
        function updateThemeColor(hexOrRgb) {
            let meta = document.querySelector('meta[name="theme-color"]');
            if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'theme-color';
                document.head.appendChild(meta);
            }
            meta.content = hexOrRgb || '#050505';
        }

        function applyDynamicTrackTheme(imgEl) {
            if (!imgEl) return;
            try {
                let color = [34, 211, 238]; // default cyan
                if (typeof ColorThief !== 'undefined' && imgEl.complete && imgEl.naturalWidth > 0) {
                    try {
                        const thief = new ColorThief();
                        const extracted = thief.getColor(imgEl);
                        if (extracted && extracted.length === 3) color = extracted;
                    } catch (_) {}
                }
                const rgbStr = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
                const hexStr = `#${color.map(x => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0')).join('')}`;
                document.documentElement.style.setProperty('--album-art-gradient', `conic-gradient(from 0deg, ${rgbStr}, #050505, ${rgbStr})`);
                
                const bgPlaying = document.getElementById('background-playing');
                if (bgPlaying) {
                    bgPlaying.style.background = `radial-gradient(ellipse at 80% 90%, rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.32) 0%, rgba(5,5,5,0) 70%), radial-gradient(ellipse at 20% 20%, rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.18) 0%, rgba(5,5,5,0) 65%)`;
                    bgPlaying.style.opacity = '1';
                }

                const lyricsGlow = document.getElementById('lyrics-modal-glow');
                if (lyricsGlow) {
                    lyricsGlow.style.backgroundColor = rgbStr;
                }

                updateThemeColor(hexStr);
            } catch (_) {}
        }

