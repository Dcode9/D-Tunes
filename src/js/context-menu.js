        // ============================================
        // CONTEXT MENU LOGIC
        // ============================================
        const ctxMenu = {
            activeStoreId: null, activePlaylistName: null,
            init: () => {
                const menu = document.getElementById('context-menu');
                document.addEventListener('click', (e) => { 
                    menu.classList.add('hidden'); 
                    if (!e.target.closest('#profile-dropdown') && !e.target.closest('[onclick*="profile-dropdown"]')) {
                        document.getElementById('profile-dropdown').classList.add('hidden');
                    }
                });
                document.getElementById('cm-play-next').onclick = () => { const s = songStore.get(ctxMenu.activeStoreId); if(s) player.addNext(s); };
                document.getElementById('cm-add-queue').onclick = () => { const s = songStore.get(ctxMenu.activeStoreId); if(s) player.addToQueue(s); };
                document.getElementById('cm-add-playlist').onclick = (e) => { e.stopPropagation(); menu.classList.add('hidden'); ctxMenu.showPlaylistSelector(); };
                document.getElementById('cm-like-song').onclick = () => { const s = songStore.get(ctxMenu.activeStoreId); if(s) player.likeSong(s.id); menu.classList.add('hidden'); };
                document.getElementById('cm-add-library').onclick = () => { const s = songStore.get(ctxMenu.activeStoreId); if(s) player.addToLibrary(s.id); menu.classList.add('hidden'); };
                document.getElementById('cm-pl-play').onclick = () => { ui.playPlaylist(ctxMenu.activePlaylistName); };
                const cmPlNext = document.getElementById('cm-pl-play-next');
                if (cmPlNext) cmPlNext.onclick = () => { player.addPlaylistNext(ctxMenu.activePlaylistName); };
                const cmPlQueue = document.getElementById('cm-pl-add-queue');
                if (cmPlQueue) cmPlQueue.onclick = () => { player.addPlaylistToQueue(ctxMenu.activePlaylistName); };
                const cmPlEdit = document.getElementById('cm-pl-edit');
                if (cmPlEdit) cmPlEdit.onclick = () => { ui.openPlaylistEditor(ctxMenu.activePlaylistName); };
                document.getElementById('cm-pl-delete').onclick = () => { ui.deletePlaylist(ctxMenu.activePlaylistName); };
            },
            showSong: (event, storeId) => {
                ctxMenu.activeStoreId = storeId; const menu = document.getElementById('context-menu');
                const song = songStore.get(storeId);
                const likeLabel = document.getElementById('cm-like-song-label');
                const libraryLabel = document.getElementById('cm-add-library-label');
                if (likeLabel && song) likeLabel.textContent = player.isLiked(song.id) ? 'Unlike song' : 'Like song';
                if (libraryLabel && song) libraryLabel.textContent = player.isInLibrary(song.id) ? 'Remove from Library' : 'Add to Library';
                document.getElementById('cm-song-options').classList.remove('hidden'); document.getElementById('cm-playlist-options').classList.add('hidden');
                menu.classList.remove('hidden'); const x = Math.min(event.clientX, window.innerWidth - 200); const y = Math.min(event.clientY, window.innerHeight - 150);
                menu.style.left = `${x}px`; menu.style.top = `${y}px`;
            },
            showPlaylist: (event, playlistName) => {
                ctxMenu.activePlaylistName = playlistName; const menu = document.getElementById('context-menu');
                document.getElementById('cm-song-options').classList.add('hidden'); document.getElementById('cm-playlist-options').classList.remove('hidden');
                menu.classList.remove('hidden'); const x = Math.min(event.clientX, window.innerWidth - 200); const y = Math.min(event.clientY, window.innerHeight - 150);
                menu.style.left = `${x}px`; menu.style.top = `${y}px`;
            },
            showPlaylistSelector: () => {
                const song = songStore.get(ctxMenu.activeStoreId); if(!song) return;
                const modal = document.getElementById('playlist-selector-modal'); const list = document.getElementById('playlist-selector-list');
                let html = '';
                Object.keys(state.playlists).forEach(name => {
                    html += `<button class="w-full text-left px-4 py-3 glass-panel rounded-lg hover:bg-white/10 text-white transition" onclick="ui.addSongToPlaylist('${utils.escapeJs(name)}')">${utils.escapeHtml(name)}</button>`;
                });
                if(Object.keys(state.playlists).length === 0) html = '<p class="text-gray-400 text-sm py-2">No playlists created yet.</p>';
                list.innerHTML = html; modal.classList.remove('hidden');
            }
        };

