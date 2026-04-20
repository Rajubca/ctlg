require(['jquery', 'pageFlip', 'domReady!'], function ($, St) {

    // --- LIBRARY GUARD ---
    if (!St && window.St) { St = window.St; }
    if (!St) {
        console.error('[Catalogue] PageFlip library (St) not loaded.');
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.style.display = 'none';
        return;
    }

    // --- CONFIGURATION ---
    const config = {
        combinedPath: (window.catalogueConfig?.combinedPath || 'images/combined/').replace(/\/?$/, '/'),
        // combinedBase: window.catalogueConfig?.combinedBase || 'Shatchi All Page Catouge 2025_Final Update_Page_',
        combinedBase: window.catalogueConfig?.combinedBase || 'Shatchi_All_Page_Catalogue_2025_Page_',
        // fullPath:     window.catalogueConfig?.fullPath     || 'images/full/',
        fullPath: (window.catalogueConfig?.fullPath || 'images/full/').replace(/\/?$/, '/'),
        fullBase:     window.catalogueConfig?.fullBase     || 'shatchi_',
        extension:    window.catalogueConfig?.extension   || '.webp',
        startPage:    window.catalogueConfig?.startPage   ?? 0,
        endPage:      window.catalogueConfig?.endPage     ?? 124,
        initialPage:  window.catalogueConfig?.initialPage ?? 0,
        images:       [],   // combined spread URLs
        fullImages:   []    // individual page URLs (_left / _right)
    };

    // --- STATE ---
    let state = {
        fromGridView:    false,
        currentPage:     0,    // PageFlip half-page index
        baseTranslateX:  0,
        scale:           1,
        panX:            0,
        panY:            0,
        isDragging:      false,
        startX:          0,
        startY:          0,
        isScrubbing:     false,
        isSingleView:    false,
        singlePageScale: 1,
        singlePagePanX:  0,
        singlePagePanY:  0,
        singlePageIndex: 0
    };

    // --- DOM ---
    const el = {
        flipbook:           document.getElementById('flipbook'),
        gridOverlay:        document.getElementById('gridOverlay'),
        gridContent:        document.getElementById('gridContent'),
        viewport:           document.getElementById('viewport'),

        // Scrubber (div-based, matching sample HTML)
        scrubberTrack:      document.getElementById('scrubberTrack'),
        progressBar:        document.getElementById('progressBar'),
        scrubberHandle:     document.getElementById('scrubberHandle'),
        currentPageLabel:   document.getElementById('currentPageLabel'),
        totalPagesLabel:    document.getElementById('totalPagesLabel'),
        pageCounterDisplay: document.getElementById('pageCounterDisplay'),

        // Go to page
        gotoPageInput:      document.getElementById('gotoPageInput'),
        btnGo:              document.getElementById('btnGo'),

        // Navigation
        btnFirstPage:       document.getElementById('btnFirstPage'),
        btnPrevPage:        document.getElementById('btnPrevPage'),
        btnNextPage:        document.getElementById('btnNextPage'),
        btnLastPage:        document.getElementById('btnLastPage'),

        // Zoom / Grid
        btnZoomIn:          document.getElementById('btnZoomIn'),
        btnZoomOut:         document.getElementById('btnZoomOut'),
        btnGrid:            document.getElementById('btnGrid'),
        btnCloseGrid:       document.getElementById('btnCloseGrid'),
        loadingSpinner:     document.getElementById('loadingSpinner'),

        // Single Page View
        singlePageOverlay:  document.getElementById('singlePageOverlay'),
        singlePageImage:    document.getElementById('singlePageImage'),
        singlePageViewport: document.getElementById('singlePageViewport'),
        singlePageTitle:    document.getElementById('singlePageTitle'),
        btnBackToBook:      document.getElementById('btnBackToBook'),
        btnSingleZoomIn:    document.getElementById('btnSingleZoomIn'),
        btnSingleZoomOut:   document.getElementById('btnSingleZoomOut')
    };

    let pageFlip;
    let gridObservers = [];

    // =========================================================
    // HELPERS
    // =========================================================

    function pad(num) { return num.toString().padStart(3, '0'); }
    function getTotalSpreads() { return config.images.length; }
    function halfPageToSpread(idx) { return Math.floor(idx / 2); } // 0-based to match image suffix

    function createPageLoader() {
        const wrap = document.createElement('div');
        wrap.className = 'cat-page-loader';
        const text = document.createElement('div');
        text.className = 'cat-shatchi-loader-text';
        text.innerText = 'SHATCHI';
        wrap.appendChild(text);
        return wrap;
    }

    function loadImageForDiv(div, url) {
        if (!div || div.dataset.loaded === 'true') return;
        const img = new Image();
        img.onload = () => {
            div.style.backgroundImage = `url("${url}")`;
            div.dataset.loaded = 'true';
            const ldr = div.querySelector('.cat-page-loader');
            if (ldr) ldr.remove();
        };
        img.onerror = () => console.warn('[Catalogue] Failed to load:', url);
        img.src = url;
    }

    // =========================================================
    // SCRUBBER  (div-based drag, mirrors sample HTML app.js pattern)
    // =========================================================

    function getScrubberPercent(clientX) {
        if (!el.scrubberTrack) return 0;
        const rect = el.scrubberTrack.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }

    function setScrubberUI(spreadIndex, totalSpreads) {
        if (!el.scrubberTrack) return;
        const percent = totalSpreads > 0 ? (spreadIndex / totalSpreads) * 100 : 0;
        if (el.progressBar)    el.progressBar.style.width    = `${percent}%`;
        if (el.scrubberHandle) el.scrubberHandle.style.left  = `${percent}%`;
        if (el.scrubberTrack)  el.scrubberTrack.setAttribute('aria-valuenow', spreadIndex);
    }

    function setupScrubber() {
        if (!el.scrubberTrack) return;
        let isScrubbing = false;

        const startScrub = (e) => {
            e.preventDefault();
            isScrubbing = true;
            state.isScrubbing = true;
            document.body.style.userSelect = 'none';
            updateFromScrub(e.clientX);
        };

        const moveScrub = (e) => {
            if (!isScrubbing) return;
            e.preventDefault();
            updateFromScrub(e.clientX);
        };

        const endScrub = (e) => {
            if (!isScrubbing) return;
            isScrubbing = false;
            state.isScrubbing = false;
            document.body.style.userSelect = '';
            // Commit the flip on mouseup
            const pct     = getScrubberPercent(e.clientX);
            const total   = getTotalSpreads();
            const target  = Math.round(pct * (total - 1)); // 0 to 124
            const pageIdx = Math.min(target * 2, pageFlip.getPageCount() - 1);
            pageFlip.flip(pageIdx);
        };

        function updateFromScrub(clientX) {
            const pct    = getScrubberPercent(clientX);
            const total  = getTotalSpreads(); // 125
            const maxIdx = total - 1; // 124
            const target = Math.round(pct * maxIdx); // 0 to 124
            setScrubberUI(target, maxIdx);
            if (el.currentPageLabel) el.currentPageLabel.innerText = target === 0 ? 0 : (target === 1 ? 1 : ((target - 1) * 2 + 1));
        }

        el.scrubberTrack.addEventListener('mousedown', startScrub);
        window.addEventListener('mousemove', moveScrub);
        window.addEventListener('mouseup', endScrub);

        // Touch support for scrubber
        el.scrubberTrack.addEventListener('touchstart', (e) => {
            startScrub(e.touches[0]);
        }, { passive: false });
        window.addEventListener('touchmove', (e) => {
            if (!isScrubbing) return;
            moveScrub(e.touches[0]);
        }, { passive: false });
        window.addEventListener('touchend', (e) => {
            endScrub(e.changedTouches[0]);
        });

        // Keyboard control on the scrubber track
        el.scrubberTrack.addEventListener('keydown', (e) => {
            const total   = getTotalSpreads();
            const current = halfPageToSpread(state.currentPage);
            let target    = current;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   target = Math.min(current + 1, total - 1);
            if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown')  target = Math.max(current - 1, 0);
            if (e.key === 'Home') target = 0;
            if (e.key === 'End')  target = total - 1;
            if (target !== current) {
                e.preventDefault();
                pageFlip.flip(Math.min(target * 2, pageFlip.getPageCount() - 1));
            }
        });
    }

    // =========================================================
    // UI UPDATE
    // =========================================================

    function updateUI() {
        const totalSpreads  = getTotalSpreads(); // 125
        const maxIdx = totalSpreads - 1; // 124
        const rawSpread = halfPageToSpread(state.currentPage); // 0-based
        const currentSpread = Math.min(rawSpread, maxIdx);

        if (el.currentPageLabel) el.currentPageLabel.innerText = currentSpread === 0 ? 0 : (currentSpread === 1 ? 1 : ((currentSpread - 1) * 2 + 1));
        if (el.totalPagesLabel)  el.totalPagesLabel.innerText  = 247;
        if (el.pageCounterDisplay) el.pageCounterDisplay.innerText = `Page ${currentSpread * 2} of 247`;

        setScrubberUI(currentSpread, maxIdx);
    }

    // =========================================================
    // GO TO PAGE
    // =========================================================

    function setupGotoPage() {
        const go = () => {
            const val  = parseInt(el.gotoPageInput?.value, 10);
            if (isNaN(val)) return;
            const target = val - 1; // Page flip is 0-indexed
            const clamped = Math.max(0, Math.min(target, pageFlip.getPageCount() - 1));
            pageFlip.flip(clamped);
            if (el.gotoPageInput) el.gotoPageInput.value = '';
        };

        el.btnGo?.addEventListener('click', go);
        el.gotoPageInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') go();
        });
    }

    // =========================================================
    // GRID VIEW
    // =========================================================

    function renderGrid() {
        gridObservers.forEach(obs => obs.disconnect());
        gridObservers = [];
        el.gridContent.innerHTML = '';

        config.fullImages.forEach((src, index) => {
            const item = document.createElement('div');
            item.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:transform 0.15s;';
            item.addEventListener('mouseenter', () => { item.style.transform = 'scale(1.05)'; });
            item.addEventListener('mouseleave', () => { item.style.transform = 'scale(1)'; });

            const imgWrap = document.createElement('div');
            imgWrap.style.cssText = 'width:100%;aspect-ratio:1/1.4;position:relative;border-radius:4px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1);background:#f1f5f9;border:1px solid #e2e8f0;';

            const loader = createPageLoader();
            imgWrap.appendChild(loader);

            const img = document.createElement('img');
            img.dataset.src = src;
            img.loading   = 'lazy';
            img.decoding  = 'async';
            img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity 0.3s;opacity:0;z-index:20;';
            img.alt       = `Page ${index + 1}`;
            img.onload    = () => {
                img.style.opacity = '1';
                if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
            };

            const observer = new IntersectionObserver((entries, obs) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) { entry.target.src = entry.target.dataset.src; obs.unobserve(entry.target); }
                });
            });
            observer.observe(img);
            gridObservers.push(observer);

            const label = document.createElement('span');
            label.style.cssText = 'font-size:11px;font-weight:500;color:#64748b;';
            label.innerText = `Page ${index + 1}`;

            imgWrap.appendChild(img);
            item.appendChild(imgWrap);
            item.appendChild(label);

            item.addEventListener('click', () => {
                state.fromGridView = true;
                toggleGrid();
                openSinglePageView(index);
            });

            el.gridContent.appendChild(item);
        });
    }

    function toggleGrid() {
        const isOpen = el.gridOverlay.style.display === 'flex';
        if (isOpen) {
            el.gridOverlay.style.display = 'none';
            state.scale = 1; state.panX = 0; state.panY = 0;
            applyZoom();
        } else {
            el.gridOverlay.style.display = 'flex';
        }
    }

    // =========================================================
    // ZOOM & PAN — MAIN FLIPBOOK
    // =========================================================

    function setupZoomPan() {
        const container = el.viewport;

        container.addEventListener('mousedown', (e) => {
            if (state.scale <= 1 || state.isScrubbing) return;
            e.preventDefault();
            state.isDragging = true;
            state.startX = e.clientX - state.panX;
            state.startY = e.clientY - state.panY;
            container.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!state.isDragging || state.isSingleView || state.isScrubbing) return;
            e.preventDefault();
            state.panX = e.clientX - state.startX;
            state.panY = e.clientY - state.startY;
            applyTransform();
        });

        const endDrag = () => {
            if (!state.isDragging) return;
            state.isDragging = false;
            container.style.cursor = state.scale > 1 ? 'grab' : 'default';
        };
        window.addEventListener('mouseup', endDrag);
        window.addEventListener('mouseleave', endDrag);

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            state.scale = e.deltaY < 0
                ? Math.min(state.scale + 0.5, 3)
                : Math.max(state.scale - 0.5, 1);
            if (state.scale === 1) { state.panX = 0; state.panY = 0; }
            applyZoom();
        }, { passive: false });

        container.addEventListener('dblclick', () => {
            if (state.scale > 1) { state.scale = 1; state.panX = 0; state.panY = 0; }
            else { state.scale = 2; }
            applyZoom();
        });
    }

    function applyZoom() {
        if (state.scale <= 1) {
            state.scale = 1; state.panX = 0; state.panY = 0;
            state.isDragging = false;
            el.viewport.style.cursor = 'default';
            el.flipbook.style.pointerEvents = 'auto';
        } else {
            el.viewport.style.cursor = 'grab';
            el.flipbook.style.pointerEvents = 'none';
        }
        applyTransform();
        updateUI();
    }

    function applyTransform() {
        if (state.scale > 1) {
            const maxPanX = (el.flipbook.offsetWidth * (state.scale - 1)) / 2;
            const maxPanY = (el.flipbook.offsetHeight * (state.scale - 1)) / 2;
            state.panX = Math.max(-maxPanX, Math.min(maxPanX, state.panX));
            state.panY = Math.max(-maxPanY, Math.min(maxPanY, state.panY));
        } else {
            state.panX = 0; state.panY = 0;
        }
        const totalX = state.panX + (state.baseTranslateX || 0);
        el.flipbook.style.transform       = `translate(${totalX}px, ${state.panY}px) scale(${state.scale})`;
        el.flipbook.style.transformOrigin = 'center center';
        el.flipbook.style.transition      = state.isDragging ? 'none' : 'transform 0.5s ease-out';
    }

    // =========================================================
    // KEYBOARD NAVIGATION
    // =========================================================

    function setupKeyboardNav() {
        document.addEventListener('keydown', (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            if (state.isSingleView) {
                if (e.key === 'Escape') { closeSinglePageView(); return; }
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { const n = state.singlePageIndex + 1; if (n < config.fullImages.length) openSinglePageView(n); }
                if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { const p = state.singlePageIndex - 1; if (p >= 0) openSinglePageView(p); }
                return;
            }

            if (el.gridOverlay.style.display === 'flex') {
                if (e.key === 'Escape') toggleGrid();
                return;
            }

            switch (e.key) {
                case 'ArrowRight': case 'PageDown':  pageFlip.flipNext(); break;
                case 'ArrowLeft':  case 'PageUp':    pageFlip.flipPrev(); break;
                case 'Home':  pageFlip.flip(0); break;
                case 'End':   pageFlip.flip(pageFlip.getPageCount() - 1); break;
                case '+': case '=': state.scale = Math.min(state.scale + 0.5, 3); applyZoom(); break;
                case '-':           state.scale = Math.max(state.scale - 0.5, 1); applyZoom(); break;
            }
        });
    }

    // =========================================================
    // SINGLE PAGE VIEW
    // =========================================================

    function openSinglePageView(index) {
        state.isSingleView    = true;
        state.singlePageIndex = index;
        state.singlePageScale = 1;
        state.singlePagePanX  = 0;
        state.singlePagePanY  = 0;
        el.singlePageImage.src       = config.fullImages[index];
        el.singlePageTitle.innerText = `Page ${index + 1}`;
        applySinglePageTransform();
        el.singlePageOverlay.style.display = 'flex';
    }

    function closeSinglePageView() {
        state.isSingleView = false;
        el.singlePageOverlay.style.display = 'none';
        state.scale = 1; state.panX = 0; state.panY = 0;
        applyZoom();
        if (state.fromGridView) {
            if (el.gridOverlay.style.display !== 'flex') toggleGrid();
        } else {
            const spreadIdx  = Math.floor(state.singlePageIndex / 2);
            const targetPage = spreadIdx === 0 ? 0 : spreadIdx * 2 - 1;
            pageFlip.flip(targetPage);
        }
        state.fromGridView = false;
    }
    function applySinglePageTransform() {
        if (state.singlePageScale > 1) {
            const maxPanX = (el.singlePageViewport.offsetWidth * (state.singlePageScale - 1)) / 2;
            const maxPanY = (el.singlePageViewport.offsetHeight * (state.singlePageScale - 1)) / 2;
            state.singlePagePanX = Math.max(-maxPanX, Math.min(maxPanX, state.singlePagePanX));
            state.singlePagePanY = Math.max(-maxPanY, Math.min(maxPanY, state.singlePagePanY));
        } else {
            state.singlePagePanX = 0; state.singlePagePanY = 0;
        }
        el.singlePageImage.style.transform = `translate(${state.singlePagePanX}px, ${state.singlePagePanY}px) scale(${state.singlePageScale})`;
        el.singlePageViewport.style.cursor = state.singlePageScale > 1 ? 'grab' : 'grab';
    }

    function setupSinglePageZoomPan() {
        const container = el.singlePageViewport;

        el.btnBackToBook?.addEventListener('click', closeSinglePageView);
        el.btnSingleZoomIn?.addEventListener('click', () => {
            state.singlePageScale = Math.min(state.singlePageScale + 0.5, 4);
            applySinglePageTransform();
        });
        el.btnSingleZoomOut?.addEventListener('click', () => {
            state.singlePageScale = Math.max(state.singlePageScale - 0.5, 1);
            if (state.singlePageScale === 1) { state.singlePagePanX = 0; state.singlePagePanY = 0; }
            applySinglePageTransform();
        });

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            state.singlePageScale = e.deltaY < 0
                ? Math.min(state.singlePageScale + 0.5, 4)
                : Math.max(state.singlePageScale - 0.5, 1);
            if (state.singlePageScale === 1) { state.singlePagePanX = 0; state.singlePagePanY = 0; }
            applySinglePageTransform();
        }, { passive: false });

        container.addEventListener('mousedown', (e) => {
            if (state.singlePageScale <= 1) return;
            e.preventDefault();
            state.isDragging = true;
            state.startX = e.clientX - state.singlePagePanX;
            state.startY = e.clientY - state.singlePagePanY;
            container.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!state.isDragging || !state.isSingleView) return;
            e.preventDefault();
            state.singlePagePanX = e.clientX - state.startX;
            state.singlePagePanY = e.clientY - state.startY;
            el.singlePageImage.style.transition = 'none';
            applySinglePageTransform();
        });

        window.addEventListener('mouseup', () => {
            if (!state.isSingleView || !state.isDragging) return;
            state.isDragging = false;
            el.singlePageImage.style.transition = 'transform 0.2s ease-out';
            container.style.cursor = state.singlePageScale > 1 ? 'grab' : 'grab';
        });
        // Touch pan
        container.addEventListener('touchstart', (e) => {
            if (state.singlePageScale <= 1) return;
            state.isDragging = true;
            state.startX = e.touches[0].clientX - state.singlePagePanX;
            state.startY = e.touches[0].clientY - state.singlePagePanY;
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (!state.isDragging || !state.isSingleView || state.singlePageScale <= 1) return;
            state.singlePagePanX = e.touches[0].clientX - state.startX;
            state.singlePagePanY = e.touches[0].clientY - state.startY;
            el.singlePageImage.style.transition = 'none';
            applySinglePageTransform();
        }, { passive: true });

        window.addEventListener('touchend', () => {
            if (!state.isSingleView || !state.isDragging) return;
            state.isDragging = false;
            el.singlePageImage.style.transition = 'transform 0.2s ease-out';
        });


        container.addEventListener('dblclick', () => {
            if (state.singlePageScale > 1) { state.singlePageScale = 1; state.singlePagePanX = 0; state.singlePagePanY = 0; }
            else { state.singlePageScale = 2; }
            applySinglePageTransform();
        });
    }

    // =========================================================
    // PREVENT NATIVE IMAGE DRAG
    // =========================================================
    document.addEventListener('dragstart', (e) => {
        if (e.target.tagName.toLowerCase() === 'img') e.preventDefault();
    });

    // =========================================================
    // INIT
    // =========================================================

    function init() {
        config.images     = [];
        config.fullImages = [];
        el.flipbook.innerHTML = '';

        for (let i = config.startPage; i <= config.endPage; i++) {
            const combinedUrl = `${config.combinedPath}${encodeURIComponent(config.combinedBase + pad(i) + config.extension)}`;
            config.images.push(combinedUrl);
            config.fullImages.push(`${config.fullPath}${encodeURIComponent(config.fullBase + pad(i) + '_left'  + config.extension)}`);
            config.fullImages.push(`${config.fullPath}${encodeURIComponent(config.fullBase + pad(i) + '_right' + config.extension)}`);

            // LEFT page
            const pageLeft   = document.createElement('div');
            pageLeft.className = 'page page-split page-left';
            const innerLeft  = document.createElement('div');
            innerLeft.style.cssText = 'width:100%;height:100%;position:relative;z-index:1;background-size:200% 100%;background-position:left center;background-repeat:no-repeat;background-color:#f1f5f9;';
            innerLeft.appendChild(createPageLoader());
            innerLeft.dataset.bg = combinedUrl;
            pageLeft.appendChild(innerLeft);
            el.flipbook.appendChild(pageLeft);

            // RIGHT page
            const pageRight  = document.createElement('div');
            pageRight.className = 'page page-split page-right';
            const innerRight = document.createElement('div');
            innerRight.style.cssText = 'width:100%;height:100%;position:relative;z-index:1;background-size:200% 100%;background-position:right center;background-repeat:no-repeat;background-color:#f1f5f9;';
            innerRight.appendChild(createPageLoader());
            innerRight.dataset.bg = combinedUrl;
            pageRight.appendChild(innerRight);
            el.flipbook.appendChild(pageRight);
        }

        // Eagerly load first 3 spreads
        Array.from(el.flipbook.querySelectorAll('.page-split > div'))
            .slice(0, 6)
            .forEach(div => { if (div?.dataset.bg) loadImageForDiv(div, div.dataset.bg); });

        // Init PageFlip
        pageFlip = new St.PageFlip(el.flipbook, {
            width: 410, height: 580,
            size: 'stretch',
            minWidth: 200, maxWidth: 2000,
            minHeight: 250, maxHeight: 2800,
            maxShadowOpacity: 0.5,
            showCover: false,
            usePortrait: false,
            useMouseEvents: true,
            clickEventForward: false,
            disableFlipByClick: true
        });

        pageFlip.loadFromHTML(document.querySelectorAll('.page'));
        applyTransform();

        // On flip: lazy-load surrounding pages
        pageFlip.on('flip', (e) => {
            state.currentPage    = e.data;
            state.baseTranslateX = 0;
            applyTransform();
            updateUI();

            const allPages = el.flipbook.querySelectorAll('.page-split > div');
            [-2,-1,0,1,2,3].forEach(offset => {
                const idx = e.data + offset;
                if (idx >= 0 && idx < allPages.length && allPages[idx]?.dataset.bg)
                    loadImageForDiv(allPages[idx], allPages[idx].dataset.bg);
            });
            [4,5,6,7,8,9].forEach(offset => {
                const idx = e.data + offset;
                if (idx >= 0 && idx < allPages.length) {
                    const div = allPages[idx];
                    if (div?.dataset.bg && div.style.backgroundImage === 'none')
                        (new Image()).src = div.dataset.bg;
                }
            });
        });

        // On init: hide spinner, show flipbook
        pageFlip.on('init', () => {
            if (el.loadingSpinner) {
                el.loadingSpinner.style.opacity = '0';
                setTimeout(() => { el.loadingSpinner.style.display = 'none'; }, 300);
            }
            el.flipbook.style.opacity = '1';

            if (config.initialPage > 0) {
                const tp = Math.min(config.initialPage * 2, pageFlip.getPageCount() - 1);
                pageFlip.flip(tp);
            }

            // Background preload spreads 4–8
            setTimeout(() => {
                for (let j = config.startPage + 4; j <= Math.min(config.startPage + 8, config.endPage); j++) {
                    (new Image()).src = `${config.combinedPath}${encodeURIComponent(config.combinedBase + pad(j) + config.extension)}`;
                }
            }, 1000);
        });

        // Navigation
        el.btnFirstPage?.addEventListener('click', () => pageFlip.flip(0));
        el.btnPrevPage?.addEventListener('click',  () => pageFlip.flipPrev());
        el.btnNextPage?.addEventListener('click',  () => pageFlip.flipNext());
        el.btnLastPage?.addEventListener('click',  () => pageFlip.flip(pageFlip.getPageCount() - 1));

        // Zoom
        el.btnZoomIn?.addEventListener('click',  () => { state.scale = Math.min(state.scale + 0.5, 3); applyZoom(); });
        el.btnZoomOut?.addEventListener('click', () => { state.scale = Math.max(state.scale - 0.5, 1); applyZoom(); });

        // Grid
        el.btnGrid?.addEventListener('click',      toggleGrid);
        el.btnCloseGrid?.addEventListener('click', toggleGrid);

        window.addEventListener('resize', () => {
            if (pageFlip) pageFlip.update();
        });

        // Wire all systems
        setupScrubber();
        setupGotoPage();
        renderGrid();
        setupZoomPan();
        setupSinglePageZoomPan();

        setupKeyboardNav();

        updateUI();
    }

    init();
});
