(function () {
    const MODAL_ID = 'dtunes-dev-options-modal';

    function initDevButton() {
        if (document.getElementById('dev-options-header-btn')) return;

        // Try to add to desktop header
        const accountArea = document.getElementById('header-account');
        if (accountArea) {
            const btn = document.createElement('button');
            btn.id = 'dev-options-header-btn';
            btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold hover:bg-amber-500/30 hover:scale-105 active:scale-95 transition shadow-lg shadow-amber-500/10 cursor-pointer';
            btn.innerHTML = `<span>🛠️</span><span class="hidden sm:inline">Dev Options</span>`;
            btn.title = "Temporary Developer Options";
            btn.onclick = () => window.devOptions.toggle();
            accountArea.insertBefore(btn, accountArea.firstChild);
        }

        // Add a floating button for mobile screens
        if (!document.getElementById('dev-options-floating-btn')) {
            const floatBtn = document.createElement('button');
            floatBtn.id = 'dev-options-floating-btn';
            floatBtn.className = 'md:hidden fixed top-3 right-16 z-50 p-2 rounded-full bg-amber-500/90 text-black shadow-2xl hover:scale-110 active:scale-95 transition text-xs font-bold border border-amber-300 flex items-center justify-center';
            floatBtn.innerHTML = `🛠️`;
            floatBtn.title = "Dev Options";
            floatBtn.onclick = () => window.devOptions.toggle();
            document.body.appendChild(floatBtn);
        }
    }

    function createModal() {
        if (document.getElementById(MODAL_ID)) return;

        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md hidden flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in';
        modal.innerHTML = `
            <div class="relative w-full max-w-2xl bg-[#111116] border border-amber-500/40 rounded-2xl shadow-2xl p-5 sm:p-7 text-white font-sans flex flex-col max-h-[90vh] overflow-hidden">
                <!-- Header -->
                <div class="flex items-center justify-between pb-4 border-b border-white/10 flex-shrink-0">
                    <div class="flex items-center gap-2.5">
                        <span class="text-xl">🛠️</span>
                        <div>
                            <h2 class="text-lg sm:text-xl font-black text-amber-400 tracking-tight flex items-center gap-2">
                                Developer Options
                                <span class="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">Temporary</span>
                            </h2>
                            <p class="text-xs text-neutral-400">Inception AI Recommendation Engine & Autoplay Diagnostics</p>
                        </div>
                    </div>
                    <button onclick="window.devOptions.close()" class="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <!-- Tabs -->
                <div class="flex items-center gap-2 pt-4 pb-2 border-b border-white/5 flex-shrink-0 text-xs font-bold overflow-x-auto">
                    <button id="dev-tab-actions" onclick="window.devOptions.setTab('actions')" class="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 transition">Quick Actions</button>
                    <button id="dev-tab-config" onclick="window.devOptions.setTab('config')" class="px-3 py-1.5 rounded-lg bg-white/5 text-neutral-300 hover:bg-white/10 transition">API Config</button>
                    <button id="dev-tab-logs" onclick="window.devOptions.setTab('logs')" class="px-3 py-1.5 rounded-lg bg-white/5 text-neutral-300 hover:bg-white/10 transition">LLM Logs & Raw Inspector</button>
                </div>

                <!-- Content Area -->
                <div class="flex-1 overflow-y-auto py-4 space-y-5 custom-scrollbar pr-1">
                    
                    <!-- TAB 1: ACTIONS -->
                    <div id="dev-content-actions" class="space-y-4">
                        <!-- Status Banner -->
                        <div class="p-3.5 rounded-xl bg-neutral-900/90 border border-white/10 flex items-center justify-between gap-3">
                            <div class="flex items-center gap-3">
                                <span class="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
                                <div>
                                    <div class="text-xs font-bold text-white flex items-center gap-1.5">
                                        Active Provider: <span class="text-amber-400" id="dev-active-model">Inception Mercury-2.5</span>
                                    </div>
                                    <div class="text-[11px] text-neutral-400" id="dev-status-subtext">Backend: d-AI Engine (CORS Active)</div>
                                </div>
                            </div>
                            <button onclick="window.devOptions.testPing()" id="dev-ping-btn" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold transition flex items-center gap-1.5">
                                <span>⚡</span> Test Ping
                            </button>
                        </div>

                        <!-- Action Grid -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div class="p-4 rounded-xl bg-neutral-900/60 border border-white/5 flex flex-col justify-between">
                                <div>
                                    <h4 class="font-bold text-sm text-white flex items-center gap-1.5 mb-1">
                                        <span>🚀</span> Force Generate Mixes
                                    </h4>
                                    <p class="text-xs text-neutral-400 mb-3">Immediately triggers Inception AI to create 6 personalized mixes, bypassing cache.</p>
                                </div>
                                <button onclick="window.devOptions.forceGenerate()" id="dev-btn-generate" class="w-full py-2 px-3 rounded-lg bg-amber-500 text-black font-black text-xs hover:bg-amber-400 transition flex items-center justify-center gap-2">
                                    <span>✨</span> Generate Recommendations
                                </button>
                            </div>

                            <div class="p-4 rounded-xl bg-neutral-900/60 border border-white/5 flex flex-col justify-between">
                                <div>
                                    <h4 class="font-bold text-sm text-white flex items-center gap-1.5 mb-1">
                                        <span>📻</span> Test AI Infinite Radio
                                    </h4>
                                    <p class="text-xs text-neutral-400 mb-3">Simulates the end of current track and asks Inception to predict & queue next song.</p>
                                </div>
                                <button onclick="window.devOptions.testAutoplay()" class="w-full py-2 px-3 rounded-lg bg-emerald-500 text-black font-black text-xs hover:bg-emerald-400 transition flex items-center justify-center gap-2">
                                    <span>▶️</span> Test Autoplay Next
                                </button>
                            </div>

                            <div class="p-4 rounded-xl bg-neutral-900/60 border border-white/5 flex flex-col justify-between">
                                <div>
                                    <h4 class="font-bold text-sm text-white flex items-center gap-1.5 mb-1">
                                        <span>🧬</span> Inject Sample Taste Profile
                                    </h4>
                                    <p class="text-xs text-neutral-400 mb-3">Injects sample popular songs (Weeknd, Dua Lipa, Arijit Singh) into history/likes for instant testing.</p>
                                </div>
                                <button onclick="window.devOptions.injectSampleData()" class="w-full py-2 px-3 rounded-lg bg-blue-500 text-white font-bold text-xs hover:bg-blue-400 transition flex items-center justify-center gap-2">
                                    <span>📥</span> Load Sample Profile
                                </button>
                            </div>

                            <div class="p-4 rounded-xl bg-neutral-900/60 border border-white/5 flex flex-col justify-between">
                                <div>
                                    <h4 class="font-bold text-sm text-white flex items-center gap-1.5 mb-1">
                                        <span>🧹</span> Clear AI Cache
                                    </h4>
                                    <p class="text-xs text-neutral-400 mb-3">Clears cached generated playlists from localStorage to force cold start.</p>
                                </div>
                                <button onclick="window.devOptions.clearCache()" class="w-full py-2 px-3 rounded-lg bg-neutral-800 text-red-400 border border-red-500/20 font-bold text-xs hover:bg-red-500/20 transition flex items-center justify-center gap-2">
                                    <span>🗑️</span> Clear AI Cache
                                </button>
                            </div>
                        </div>

                        <!-- User Profile Counts -->
                        <div class="p-3.5 rounded-xl bg-neutral-900/40 border border-white/5 text-xs grid grid-cols-3 gap-2 text-center">
                            <div>
                                <span class="text-neutral-400 block text-[10px] uppercase">History Tracks</span>
                                <span id="dev-count-history" class="text-base font-bold text-white">0</span>
                            </div>
                            <div>
                                <span class="text-neutral-400 block text-[10px] uppercase">Liked Songs</span>
                                <span id="dev-count-liked" class="text-base font-bold text-white">0</span>
                            </div>
                            <div>
                                <span class="text-neutral-400 block text-[10px] uppercase">Library Songs</span>
                                <span id="dev-count-library" class="text-base font-bold text-white">0</span>
                            </div>
                        </div>
                    </div>

                    <!-- TAB 2: CONFIG -->
                    <div id="dev-content-config" class="hidden space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-neutral-300 mb-1">AI Chat Completion Endpoint</label>
                            <input id="dev-input-endpoint" type="text" class="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-400 transition" />
                            <p class="text-[10px] text-neutral-500 mt-1">Default: <span class="text-neutral-400">https://ai.d-verse.in/api/chat</span> (d-AI Inception proxy with CORS)</p>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-neutral-300 mb-1">Provider & Model</label>
                            <div class="grid grid-cols-2 gap-2">
                                <input id="dev-input-provider" type="text" value="inception" class="bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white" />
                                <input id="dev-input-model" type="text" value="mercury-2.5" class="bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white" />
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-neutral-300 mb-1">Custom Inception API Key (Optional Override)</label>
                            <input id="dev-input-apikey" type="password" placeholder="Leave empty to use d-AI backend token" class="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-400 transition" />
                            <p class="text-[10px] text-neutral-500 mt-1">If empty, the pre-authenticated d-AI proxy handles authentication seamlessly.</p>
                        </div>

                        <div class="flex items-center justify-between p-3 rounded-xl bg-neutral-900/60 border border-white/5">
                            <div>
                                <h5 class="text-xs font-bold text-white">AI Infinite Radio (Auto-play)</h5>
                                <p class="text-[10px] text-neutral-400">Automatically call Inception AI when current queue reaches the end.</p>
                            </div>
                            <input id="dev-toggle-autoplay" type="checkbox" checked class="w-4 h-4 rounded text-amber-500 bg-neutral-800 border-white/20 focus:ring-0" />
                        </div>

                        <div class="pt-2 flex justify-end gap-2">
                            <button onclick="window.devOptions.resetConfig()" class="px-4 py-2 rounded-lg bg-white/5 text-neutral-300 text-xs font-bold hover:bg-white/10 transition">Reset Defaults</button>
                            <button onclick="window.devOptions.saveConfig()" class="px-5 py-2 rounded-lg bg-amber-500 text-black text-xs font-black hover:bg-amber-400 transition">Save Config</button>
                        </div>
                    </div>

                    <!-- TAB 3: LOGS & RAW -->
                    <div id="dev-content-logs" class="hidden space-y-4">
                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <h5 class="text-xs font-bold text-white">Live Activity Log</h5>
                                <button onclick="window.devOptions.clearLogs()" class="text-[10px] text-neutral-400 hover:text-white transition">Clear Logs</button>
                            </div>
                            <div id="dev-log-container" class="h-36 overflow-y-auto bg-black border border-white/10 rounded-xl p-3 font-mono text-[11px] space-y-1 custom-scrollbar">
                                <p class="text-neutral-500">No logs yet.</p>
                            </div>
                        </div>

                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <h5 class="text-xs font-bold text-white">Last Prompt Sent</h5>
                                <button onclick="window.devOptions.copyLastPrompt()" class="text-[10px] text-amber-400 hover:underline">Copy Prompt</button>
                            </div>
                            <pre id="dev-last-prompt" class="max-h-36 overflow-y-auto bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-[10px] text-neutral-300 custom-scrollbar whitespace-pre-wrap">None</pre>
                        </div>

                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <h5 class="text-xs font-bold text-white">Last LLM Raw Response</h5>
                                <button onclick="window.devOptions.copyLastResponse()" class="text-[10px] text-emerald-400 hover:underline">Copy JSON</button>
                            </div>
                            <pre id="dev-last-response" class="max-h-48 overflow-y-auto bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-[10px] text-emerald-300 custom-scrollbar whitespace-pre-wrap">None</pre>
                        </div>
                    </div>

                </div>

                <!-- Footer -->
                <div class="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-neutral-500 flex-shrink-0">
                    <span>Press <kbd class="px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 font-mono text-[10px]">Esc</kbd> to close</span>
                    <button onclick="window.devOptions.close()" class="px-4 py-1.5 rounded-lg bg-white/10 text-white font-bold hover:bg-white/20 transition">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                window.devOptions.close();
            }
        });
    }

    const devOptions = {
        init: () => {
            initDevButton();
            createModal();
            devOptions.syncInputs();
            devOptions.updateUI();
        },

        open: () => {
            createModal();
            const modal = document.getElementById(MODAL_ID);
            if (modal) {
                modal.classList.remove('hidden');
                devOptions.syncInputs();
                devOptions.updateUI();
            }
        },

        close: () => {
            const modal = document.getElementById(MODAL_ID);
            if (modal) modal.classList.add('hidden');
        },

        toggle: () => {
            const modal = document.getElementById(MODAL_ID);
            if (modal && !modal.classList.contains('hidden')) {
                devOptions.close();
            } else {
                devOptions.open();
            }
        },

        setTab: (tabName) => {
            const tabs = ['actions', 'config', 'logs'];
            tabs.forEach(t => {
                const btn = document.getElementById(`dev-tab-${t}`);
                const content = document.getElementById(`dev-content-${t}`);
                if (t === tabName) {
                    btn?.classList.add('bg-amber-500/20', 'text-amber-300', 'border', 'border-amber-500/40');
                    btn?.classList.remove('bg-white/5', 'text-neutral-300');
                    content?.classList.remove('hidden');
                } else {
                    btn?.classList.remove('bg-amber-500/20', 'text-amber-300', 'border', 'border-amber-500/40');
                    btn?.classList.add('bg-white/5', 'text-neutral-300');
                    content?.classList.add('hidden');
                }
            });
        },

        syncInputs: () => {
            if (!window.ai) return;
            const cfg = window.ai.getConfig();
            const inputEndpoint = document.getElementById('dev-input-endpoint');
            const inputProvider = document.getElementById('dev-input-provider');
            const inputModel = document.getElementById('dev-input-model');
            const inputApiKey = document.getElementById('dev-input-apikey');
            const toggleAuto = document.getElementById('dev-toggle-autoplay');

            if (inputEndpoint) inputEndpoint.value = cfg.endpoint;
            if (inputProvider) inputProvider.value = cfg.provider;
            if (inputModel) inputModel.value = cfg.model;
            if (inputApiKey) inputApiKey.value = cfg.apiKey;
            if (toggleAuto) toggleAuto.checked = cfg.autoPlayEnabled;
        },

        saveConfig: () => {
            if (!window.ai) return;
            const endpoint = document.getElementById('dev-input-endpoint')?.value?.trim();
            const provider = document.getElementById('dev-input-provider')?.value?.trim();
            const model = document.getElementById('dev-input-model')?.value?.trim();
            const apiKey = document.getElementById('dev-input-apikey')?.value?.trim();
            const autoPlayEnabled = document.getElementById('dev-toggle-autoplay')?.checked;

            window.ai.saveConfig({
                endpoint: endpoint || "https://ai.d-verse.in/api/chat",
                provider: provider || "inception",
                model: model || "mercury-2.5",
                apiKey: apiKey || "",
                autoPlayEnabled: autoPlayEnabled !== false
            });

            if (window.ui?.showToast) ui.showToast("Dev Options: Configuration saved!");
            devOptions.updateUI();
        },

        resetConfig: () => {
            if (!window.ai) return;
            window.ai.saveConfig({
                endpoint: "https://ai.d-verse.in/api/chat",
                provider: "inception",
                model: "mercury-2.5",
                apiKey: "",
                autoPlayEnabled: true
            });
            devOptions.syncInputs();
            if (window.ui?.showToast) ui.showToast("Dev Options: Reset to defaults");
            devOptions.updateUI();
        },

        testPing: async () => {
            const btn = document.getElementById('dev-ping-btn');
            const sub = document.getElementById('dev-status-subtext');
            if (btn) btn.innerHTML = `<span>⏳</span> Pinging...`;
            const result = await window.ai.testConnection();
            if (result.success) {
                if (btn) btn.innerHTML = `<span>✅</span> ${result.duration}ms`;
                if (sub) sub.textContent = `Connected successfully in ${result.duration}ms!`;
                if (window.ui?.showToast) ui.showToast(`Inception API Connected (${result.duration}ms)`);
            } else {
                if (btn) btn.innerHTML = `<span>❌</span> Error`;
                if (sub) sub.textContent = `Ping failed: ${result.error}`;
                if (window.ui?.showToast) ui.showToast(`Inception API Error: ${result.error}`);
            }
        },

        forceGenerate: async () => {
            const btn = document.getElementById('dev-btn-generate');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span>⏳</span> Generating Mixes...`;
            }
            try {
                if (window.aiHome && window.aiHome.renderAIHome) {
                    await window.aiHome.renderAIHome(true);
                } else if (window.homeView && window.homeView.init) {
                    await window.homeView.init();
                }
                if (window.ui?.showToast) ui.showToast("AI Recommendations generated successfully!");
            } catch (e) {
                if (window.ui?.showToast) ui.showToast("Generation error: " + e.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<span>✨</span> Generate Recommendations`;
                }
                devOptions.updateUI();
            }
        },

        testAutoplay: async () => {
            if (!state.currentTrack) {
                const sampleSong = (state.playHistory && state.playHistory[0]) || { name: "Blinding Lights", artist: "The Weeknd" };
                state.currentTrack = sampleSong;
            }
            if (window.player && window.player.triggerQueueAutoplay) {
                await window.player.triggerQueueAutoplay(8);
            } else if (window.homeView && window.homeView.autoplayNextIntelligentTracks) {
                await window.homeView.autoplayNextIntelligentTracks();
            }
            devOptions.updateUI();
        },

        injectSampleData: () => {
            const samples = [
                { id: "sample_1", name: "Starboy", title: "Starboy", artist: "The Weeknd", img: "https://c.saavncdn.com/974/Starboy-English-2016-500x500.jpg", duration: 230 },
                { id: "sample_2", name: "Blinding Lights", title: "Blinding Lights", artist: "The Weeknd", img: "https://c.saavncdn.com/584/After-Hours-English-2020-20200320011550-500x500.jpg", duration: 200 },
                { id: "sample_3", name: "Levitating", title: "Levitating", artist: "Dua Lipa", img: "https://c.saavncdn.com/836/Future-Nostalgia-English-2020-20200327124651-500x500.jpg", duration: 203 },
                { id: "sample_4", name: "Kesariya", title: "Kesariya", artist: "Arijit Singh", img: "https://c.saavncdn.com/191/Kesariya-From-Brahmastra-Hindi-2022-20220717092820-500x500.jpg", duration: 268 },
                { id: "sample_5", name: "Get Lucky", title: "Get Lucky", artist: "Daft Punk", img: "https://c.saavncdn.com/933/Random-Access-Memories-English-2013-500x500.jpg", duration: 248 }
            ];

            state.playHistory = [...samples, ...(state.playHistory || [])];
            state.likedIds = [...samples.slice(0, 3), ...(state.likedIds || [])];
            state.libraryIds = [...samples.slice(2, 5), ...(state.libraryIds || [])];

            localStorage.setItem('playHistory', JSON.stringify(state.playHistory));
            localStorage.setItem('likedIds', JSON.stringify(state.likedIds));
            localStorage.setItem('libraryIds', JSON.stringify(state.libraryIds));

            if (window.ui && ui.renderHistory) ui.renderHistory();
            if (window.ui && ui.renderLibraryLists) ui.renderLibraryLists();
            if (window.ui?.showToast) ui.showToast("Sample taste profile loaded (5 songs)!");

            devOptions.updateUI();
        },

        clearCache: () => {
            if (window.ai?.clearCache) window.ai.clearCache();
            if (window.ui?.showToast) ui.showToast("AI Cache cleared!");
            devOptions.updateUI();
        },

        clearLogs: () => {
            if (window.ai) window.ai.state.debugLogs = [];
            devOptions.updateUI();
        },

        copyLastPrompt: () => {
            const prompt = window.ai?.state?.lastPrompt;
            if (prompt && navigator.clipboard) {
                navigator.clipboard.writeText(prompt);
                if (window.ui?.showToast) ui.showToast("Prompt copied to clipboard!");
            }
        },

        copyLastResponse: () => {
            const resp = window.ai?.state?.lastResponse;
            if (resp && navigator.clipboard) {
                navigator.clipboard.writeText(resp);
                if (window.ui?.showToast) ui.showToast("Response JSON copied to clipboard!");
            }
        },

        updateUI: () => {
            // Update counts
            const countHist = document.getElementById('dev-count-history');
            const countLike = document.getElementById('dev-count-liked');
            const countLib = document.getElementById('dev-count-library');
            if (countHist) countHist.textContent = state.playHistory?.length || 0;
            if (countLike) countLike.textContent = state.likedIds?.length || 0;
            if (countLib) countLib.textContent = state.libraryIds?.length || 0;

            // Update logs
            const logContainer = document.getElementById('dev-log-container');
            if (logContainer && window.ai?.state?.debugLogs) {
                const logs = window.ai.state.debugLogs;
                if (logs.length === 0) {
                    logContainer.innerHTML = `<p class="text-neutral-500">No logs yet.</p>`;
                } else {
                    logContainer.innerHTML = logs.map(l => {
                        const color = l.type === 'error' ? 'text-red-400' : (l.type === 'warn' ? 'text-amber-400' : 'text-neutral-300');
                        return `<div class="${color}"><span class="text-neutral-500">[${l.time}]</span> ${utils.escapeHtml(l.msg)}</div>`;
                    }).join('');
                }
            }

            // Update last prompt / response
            const promptEl = document.getElementById('dev-last-prompt');
            const respEl = document.getElementById('dev-last-response');
            if (promptEl) promptEl.textContent = window.ai?.state?.lastPrompt || "None yet. Generate a mix to view.";
            if (respEl) respEl.textContent = window.ai?.state?.lastResponse || "None yet.";
        }
    };

    window.devOptions = devOptions;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', devOptions.init);
    } else {
        setTimeout(devOptions.init, 300);
    }
})();
