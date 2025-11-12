// ==UserScript==
// @name         Auto A11y Tools
// @namespace    http://tampermonkey.net/
// @version      2025-11-05
// @description  Automatically run a11y tools
// @author       Wyatt Nilsson (Original header, alt text, and iframe a11y tools are not mine)
// @match        *://*/*
// @match        file:///*
// @icon         https://www.bookmarks.design//media/image/a11yproject.jpg
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_unregisterMenuCommand
// @updateURL    https://raw.githubusercontent.com/WyWyGuy/tampermonkey-auto-a11y-tools-script/main/AutoA11yTools.user.js
// @downloadURL  https://raw.githubusercontent.com/WyWyGuy/tampermonkey-auto-a11y-tools-script/main/AutoA11yTools.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Prevent running in iframes
    if (window.top !== window.self) return;

    const autoRunDomains = [
        'byu.instructure.com',
        'byuis.instructure.com',
        'byuismastercourses.instructure.com',
        'byuohs.instructure.com'
    ];

    const excludedPaths = [
      /^https:\/\/byu\.instructure\.com\/courses\/1026(\/|$)/, // Training course
      /^https:\/\/byu\.instructure\.com\/courses\/\d+\/modules$/, // Any course's modules page
      /^https:\/\/byu\.instructure\.com\/courses\/\d+\/pages\/[^/]+\/edit$/ // Any course's page edit view
    ];
    const currentHost = window.location.hostname;
    const isAutoRunDomain = autoRunDomains.includes(currentHost);
    const isExcludedPage = excludedPaths.some(pattern => pattern.test(window.location.href));
    const shouldAutoRun = isAutoRunDomain && !isExcludedPage;

    let tempToolStates = {};

    // Central tool tracking object
    const TOOLS = {
        IMG: {
            id: "img",
            label: "Image Alt Overlay",
            key: "a11y_img",
            run: runImageAltOverlay,
            remove: removeImageAltOverlay
        },
        IFRAME: {
            id: "iframe",
            label: "Iframe Labels",
            key: "a11y_iframe",
            run: runIframeLabelOverlay,
            remove: removeIframeLabelOverlay
        },
        HEADING: {
            id: "heading",
            label: "Heading Tags",
            key: "a11y_heading",
            run: runHeadingTagOverlay,
            remove: removeHeadingOverlay
        },
        CONTRAST: {
            id: "contrast",
            label: "Contrast Highlights",
            key: "a11y_contrast",
            run: highlightContrastFailures,
            remove: removeContrastHighlights
        },
        IB: {
            id: "ib",
            label: "<i>/<b> Highlights",
            key: "a11y_ib",
            run: runIBTagOverlay,
            remove: removeIBHighlights
        }
    };

    const toolResources = new Map();

    // Resource management functions
    function ensureToolResources(key) {
        if (!toolResources.has(key)) {
            toolResources.set(key, { observers: [], listeners: [], containers: [] });
        }
        return toolResources.get(key);
    }

    function addObserver(key, obs) {
        ensureToolResources(key).observers.push(obs);
    }

    function addListener(key, target, type, handler, options) {
        ensureToolResources(key).listeners.push({ target, type, handler, options });
        try {
            target.addEventListener(type, handler, options);
        } catch (e) { /* ignore */ }
    }

    function addContainer(key, el) {
        ensureToolResources(key).containers.push(el);
    }

    function cleanupTool(key) {
        const res = toolResources.get(key);
        if (!res) return;
        res.observers.forEach(o => { try { o.disconnect(); } catch (e) { } });
        res.listeners.forEach(l => { try { l.target.removeEventListener(l.type, l.handler, l.options); } catch (e) { } });
        res.containers.forEach(c => { try { c.remove(); } catch (e) { } });
        toolResources.delete(key);
    }

    // Global styles
    function ensureGlobalStyles() {
        if (document.getElementById('a11y-overlay-styles')) return;
        const style = document.createElement('style');
        style.id = 'a11y-overlay-styles';
        style.textContent = `
      .AccessibilityHelper { font-family: Arial, Helvetica, sans-serif; }
      .A11y-img-label { position:absolute;background:#FFF;border:3px solid #CCC;border-radius:7px;padding:5px;text-align:left;white-space:pre-wrap;font-size:12px;width:150px;z-index:9999;color:black;display:none }
      .A11y-img-border { position:absolute;border:3px solid #CCC;border-radius:7px;z-index:9998;display:none;pointer-events:none;transition:border-color 0.2s ease, box-shadow 0.2s ease }
      .A11y-iframe-label { position:absolute;background:#FFF;border:3px solid #CCC;border-radius:7px;padding:5px;text-align:left;white-space:pre-wrap;width:300px;font-size:12px;z-index:9999;transition:all 0.2s ease;display:none }
      .A11y-iframe-border { position:absolute;border:3px solid #CCC;border-radius:7px;z-index:9998;transition:all 0.2s ease;display:none;pointer-events:none }
      .AccessibilityHelper-label { background: #FFF;border: 3px solid #CCC;border-radius: 4px;padding: 2px 4px;position: absolute;white-space: nowrap;font-size: 12px;z-index: 10001;color: black;transition: all 0.2s ease;display: none }
      .AccessibilityHelper-border { position: absolute;border: 3px solid #CCC;border-radius: 4px;z-index: 9999;pointer-events: none;transition: all 0.2s ease;display: none }
      .AccessibilityHelper-highlight { border-color: #393 !important;box-shadow: 1px 2px 5px #CCC }
      .IBOverlay-border { position: absolute;border: 2px solid red;border-radius: 4px;z-index: 9999;pointer-events: none;transition: all 0.2s ease;display: none }
      .IBOverlay-highlight { border-color: #c00 !important;box-shadow: 1px 2px 5px #f99 }
      .ContrastOverlay-border { position: absolute;border: 2px solid blue;border-radius: 4px;z-index: 9999;pointer-events: none;transition: all 0.2s ease;display: none }
      .ContrastOverlay-highlight { border-color: #339 !important;box-shadow: 1px 2px 5px #99f }
    `;
        document.head.appendChild(style);
    }

    ensureGlobalStyles();

    // Utility functions
    function debounce(fn, wait = 80) {
        let t = null;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function makeLabel(toolKey, className, text, cssText) {
        const label = document.createElement('div');
        label.className = 'AccessibilityHelper ' + className;
        if (cssText) label.style.cssText = cssText;
        if (text !== undefined) label.textContent = text;
        document.body.appendChild(label);
        addContainer(toolKey, label);
        return label;
    }

    function makeBorder(toolKey, className, cssText) {
        const border = document.createElement('div');
        border.className = 'AccessibilityHelper ' + className;
        if (cssText) border.style.cssText = cssText;
        document.body.appendChild(border);
        addContainer(toolKey, border);
        return border;
    }

    function attachAutoUpdate(toolKey, updateFn, opts = {}) {
        const debounced = opts.debounce === false ? updateFn : debounce(updateFn, opts.wait || 80);
        addListener(toolKey, window, 'scroll', debounced, { passive: true });
        addListener(toolKey, window, 'resize', debounced);
        const mo = new MutationObserver(debounced);
        mo.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: opts.attributeFilter || ['style', 'class', 'hidden']
        });
        addObserver(toolKey, mo);
        return mo;
    }

    function normalizeColor(colorStr) {
        if (!colorStr) return '';
        try {
            const el = document.createElement('div');
            el.style.position = 'absolute';
            el.style.left = '-9999px';
            el.style.width = '1px';
            el.style.height = '1px';
            el.style.color = colorStr;
            document.documentElement.appendChild(el);
            const val = getComputedStyle(el).color || '';
            el.remove();
            return val.trim();
        } catch (e) {
            return colorStr;
        }
    }

    // Initialize persistent settings
    Object.values(TOOLS).forEach(tool => {
        if (GM_getValue(tool.key) === undefined) {
            GM_setValue(tool.key, true);
        }
    });

    let menuIds = {};

    // Menu command management
    function updateMenuCommands() {
        Object.values(menuIds).forEach(id => {
            try { if (id) GM_unregisterMenuCommand(id); } catch (e) { /* ignore */ }
        });

        menuIds = {};

        menuIds.activateAll = GM_registerMenuCommand('Activate All A11y Tools', () => {
            const container = document.body;
            Object.values(TOOLS).forEach(tool => {
                if (shouldAutoRun) {
                    GM_setValue(tool.key, true);
                } else {
                    tempToolStates[tool.key] = true;
                }
                tool.run(container);
            });
            updateMenuCommands();
        });

        menuIds.removeAll = GM_registerMenuCommand('Remove All A11y Tools', () => {
            Object.values(TOOLS).forEach(tool => {
                if (shouldAutoRun) {
                    GM_setValue(tool.key, false);
                } else {
                    tempToolStates[tool.key] = false;
                }
                tool.remove();
            });
            document.querySelectorAll('.AccessibilityHelper').forEach(e => e.remove());
            updateMenuCommands();
        });

        Object.values(TOOLS).forEach(tool => {
            const state = shouldAutoRun
            ? GM_getValue(tool.key, true)
            : tempToolStates[tool.key] ?? false;

            menuIds[tool.id] = GM_registerMenuCommand(`${tool.label}: ${state ? 'ON' : 'OFF'}`, () => {
                toggleFeature(tool);
            });
        });
    }

    function toggleFeature(tool) {
        const isPersistent = shouldAutoRun;
        const currentState = isPersistent
        ? GM_getValue(tool.key, true)
        : tempToolStates[tool.key] ?? false;

        const newState = !currentState;

        if (isPersistent) {
            GM_setValue(tool.key, newState);
        } else {
            tempToolStates[tool.key] = newState;
        }

        updateMenuCommands();

        try {
            if (newState) {
                tool.run(document.body);
            } else {
                tool.remove();
            }
        } catch (e) { /* ignore */ }
    }

    // Initial run based on settings
    function isVisible(el) {
        if (!(el instanceof Element)) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return !!(el.offsetParent || r.width > 0 || r.height > 0);
    }

    // Tool implementations
    function runImageAltOverlay(container) {
        const toolKey = 'a11y_img';
        if (document.querySelector('.A11y-img-label')) return;
        container.querySelectorAll('img').forEach(function (img) {
            const roleAttr = (img.getAttribute && (img.getAttribute('role') || '')).toString().toLowerCase();
            const alt = roleAttr === 'presentation' ? '[Decorative]' : (img.alt ? img.alt.trim() : '[Missing]');

            const label = makeLabel(toolKey, 'A11y-img-label', 'Alt Text: ' + alt);
            const border = makeBorder(toolKey, 'A11y-img-border');

            function updatePositions() {
                const r = img.getBoundingClientRect();
                if (isVisible(img)) {
                    label.style.display = 'block';
                    border.style.display = 'block';
                    label.style.top = window.scrollY + r.top - label.offsetHeight - 8 + 'px';
                    label.style.left = window.scrollX + r.left + 'px';
                    border.style.top = window.scrollY + r.top - 8 + 'px';
                    border.style.left = window.scrollX + r.left - 8 + 'px';
                    border.style.width = r.width + 16 + 'px';
                    border.style.height = r.height + 16 + 'px';
                } else {
                    label.style.display = 'none';
                    border.style.display = 'none';
                }
            }

            function highlight() {
                border.style.borderColor = '#393';
                border.style.boxShadow = '1px 2px 5px #CCC';
                label.style.borderColor = '#393';
                label.style.boxShadow = '1px 2px 5px #CCC';
            }

            function unhighlight() {
                border.style.borderColor = '#CCC';
                border.style.boxShadow = 'none';
                label.style.borderColor = '#CCC';
                label.style.boxShadow = 'none';
            }

            addListener(toolKey, img, 'mouseover', highlight);
            addListener(toolKey, img, 'mouseout', unhighlight);
            addListener(toolKey, label, 'mouseover', highlight);
            addListener(toolKey, label, 'mouseout', unhighlight);

            updatePositions();
            attachAutoUpdate(toolKey, updatePositions, { attributeFilter: ['style', 'class', 'hidden', 'src', 'alt', 'role'] });
        });
    }

    function removeImageAltOverlay() {
        cleanupTool('a11y_img');
        document.querySelectorAll('.A11y-img-label, .A11y-img-border').forEach(el => el.remove());
    }

    function runIframeLabelOverlay(container) {
        const toolKey = 'a11y_iframe';
        if (document.querySelector('.A11y-iframe-label')) return;

        container.querySelectorAll('iframe').forEach(function (f) {

            let title = f.title || '[Missing]';
            let ariaLabel = f.getAttribute('aria-label');
            let ariaLabelUsedFrom = '';
            if (!ariaLabel && f.hasAttribute('aria-labelledby')) {
                const ids = f.getAttribute('aria-labelledby').split(' ');
                ariaLabel = ids.map(id => document.getElementById(id)?.textContent || '[Missing]').join(', ');
                ariaLabelUsedFrom = ' (uses labelledby)';
            }
            if (!ariaLabel) ariaLabel = '[Missing]';

            let ariaDesc = f.getAttribute('aria-description');
            let ariaDescUsedFrom = '';
            if (!ariaDesc && f.hasAttribute('aria-describedby')) {
                const ids = f.getAttribute('aria-describedby').split(' ');
                ariaDesc = ids.map(id => document.getElementById(id)?.textContent || '[Missing]').join(', ');
                ariaDescUsedFrom = ' (uses describedby)';
            }
            if (!ariaDesc) ariaDesc = '[Missing]';

            const label = document.createElement('div');
            label.className = 'AccessibilityHelper A11y-iframe-label';
            label.style.cssText = 'position:absolute;background:#FFF;border:3px solid #CCC;border-radius:7px;padding:5px;text-align:left;white-space:pre-wrap;width:300px;font-size:12px;z-index:9999;transition:all 0.2s ease;display:none;';

            const ariaLabelEmoji = ariaLabel !== '[Missing]' ? '✅' : '❌';
            const ariaDescEmoji = ariaDesc !== '[Missing]' ? '✅' : '❌';
            const titleEmoji = (title !== '[Missing]' && ariaLabel === '[Missing]' && ariaDesc === '[Missing]') ? '✅' : '❌';

            label.textContent =
                `${ariaLabelEmoji}Aria-label: ${ariaLabel}${ariaLabelUsedFrom}\n` +
                `${ariaDescEmoji}Aria-description: ${ariaDesc}${ariaDescUsedFrom}\n` +
                `${titleEmoji}Title: ${title}`;



            const border = document.createElement('span');
            border.className = 'AccessibilityHelper A11y-iframe-border';
            border.style.cssText = 'position:absolute;border:3px solid #CCC;border-radius:7px;z-index:9998;transition:all 0.2s ease;display:none;pointer-events:none;';

            function update() {
                const r = f.getBoundingClientRect();
                if (isVisible(f)) {
                    label.style.display = 'block';
                    border.style.display = 'block';
                    label.style.top = window.scrollY + r.top - 8 + 'px';
                    label.style.left = window.scrollX + r.left - 8 + 'px';
                    border.style.top = window.scrollY + r.top - 8 + 'px';
                    border.style.left = window.scrollX + r.left - 8 + 'px';
                    border.style.width = r.width + 16 + 'px';
                    border.style.height = r.height + 16 + 'px';
                } else {
                    label.style.display = 'none';
                    border.style.display = 'none';
                }
            }

            function highlight() {
                label.style.borderColor = '#393';
                label.style.boxShadow = '1px 2px 5px #CCC';
                border.style.borderColor = '#393';
                border.style.boxShadow = '1px 2px 5px #CCC';
            }
            function unhighlight() {
                label.style.borderColor = '#CCC';
                label.style.boxShadow = 'none';
                border.style.borderColor = '#CCC';
                border.style.boxShadow = 'none';
            }

            addListener(toolKey, label, 'mouseover', highlight);
            addListener(toolKey, label, 'mouseout', unhighlight);
            addListener(toolKey, border, 'mouseover', highlight);
            addListener(toolKey, border, 'mouseout', unhighlight);

            document.body.appendChild(label);
            document.body.appendChild(border);
            addContainer(toolKey, label);
            addContainer(toolKey, border);
            update();
            addListener(toolKey, window, 'scroll', update, { passive: true });
            addListener(toolKey, window, 'resize', update);
            const mo_iframe = new MutationObserver(update);
            mo_iframe.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'open']
            });
            addObserver(toolKey, mo_iframe);
        });
    }

    function removeIframeLabelOverlay() {
        cleanupTool('a11y_iframe');
        document.querySelectorAll('.A11y-iframe-label, .A11y-iframe-border').forEach(el => el.remove());
    }

    function runHeadingTagOverlay(container) {
                const toolKey = 'a11y_heading';
                if (document.querySelector('.A11y-heading-label')) return;

                document.querySelectorAll('.AccessibilityHelper-label,.AccessibilityHelper-border').forEach(e => e.remove());

        ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].flatMap(tag => [...container.querySelectorAll(tag)]).forEach(h => {
            const label = makeLabel(toolKey, 'AccessibilityHelper-label A11y-heading-label', h.tagName);
            const border = makeBorder(toolKey, 'AccessibilityHelper-border A11y-heading-border');

            function update() {
                const r = h.getBoundingClientRect();
                if (isVisible(h)) {
                    label.style.display = 'block';
                    border.style.display = 'block';
                    const top = window.scrollY + r.top;
                    const left = window.scrollX + r.left;
                    label.style.top = top - 22 + 'px';
                    label.style.left = left + 'px';
                    border.style.top = top + 'px';
                    border.style.left = left + 'px';
                    border.style.width = r.width + 'px';
                    border.style.height = r.height + 'px';
                } else {
                    label.style.display = 'none';
                    border.style.display = 'none';
                }
            }

            function highlight() {
                label.classList.add('AccessibilityHelper-highlight');
                border.classList.add('AccessibilityHelper-highlight');
            }

            function unhighlight() {
                label.classList.remove('AccessibilityHelper-highlight');
                border.classList.remove('AccessibilityHelper-highlight');
            }

            addListener(toolKey, label, 'mouseover', highlight);
            addListener(toolKey, label, 'mouseout', unhighlight);
            addListener(toolKey, h, 'mouseover', highlight);
            addListener(toolKey, h, 'mouseout', unhighlight);

            update();
            attachAutoUpdate(toolKey, update, { attributeFilter: ['style', 'class', 'hidden', 'open'] });
        });
    }

    function removeHeadingOverlay() {
        cleanupTool('a11y_heading');
        document.querySelectorAll('.A11y-heading-label, .A11y-heading-border').forEach(el => el.remove());
    }

    function runIBTagOverlay(container) {
        const toolKey = 'a11y_ib';
        let ibOverlayContainer = document.getElementById('IBOverlay-container');
        if (!ibOverlayContainer) {
            ibOverlayContainer = document.createElement('div');
            ibOverlayContainer.id = 'IBOverlay-container';
            Object.assign(ibOverlayContainer.style, {
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 9999
            });
            document.body.appendChild(ibOverlayContainer);
            addContainer(toolKey, ibOverlayContainer);
        }

        if (document.querySelector('.A11y-ib-border')) return;

        document.querySelectorAll('.AccessibilityHelper-border.A11y-ib-border').forEach(e => e.remove());

        function scanIB() {
            document.querySelectorAll('.A11y-ib-border').forEach(b => b.remove());

            const nodes = Array.from(container.querySelectorAll('i, b'));
            nodes.forEach(el => {
                const text = Array.from(el.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent.trim())
                    .join('');
                if (!text) return;

                const border = makeBorder(toolKey, 'IBOverlay-border A11y-ib-border');
                ibOverlayContainer.appendChild(border);
                border._a11yTarget = el;

                function highlight() { border.classList.add('IBOverlay-highlight'); }
                function unhighlight() { border.classList.remove('IBOverlay-highlight'); }

                addListener(toolKey, el, 'mouseover', highlight);
                addListener(toolKey, el, 'mouseout', unhighlight);
            });

            updateAllIBBorders();
        }

        function updateAllIBBorders() {
            document.querySelectorAll('.A11y-ib-border').forEach(border => {
                const el = border._a11yTarget;
                if (!el) return;
                const r = el.getBoundingClientRect();
                if (isVisible(el)) {
                    border.style.display = 'block';
                    const top = Math.round(r.top - 4);
                    const left = Math.round(r.left - 4);
                    const width = Math.round(r.width + 8);
                    const height = Math.round(r.height + 8);
                    border.style.top = `${top}px`;
                    border.style.left = `${left}px`;
                    border.style.width = `${width}px`;
                    border.style.height = `${height}px`;
                } else {
                    border.style.display = 'none';
                }
            });
        }

        const debouncedScanIB = debounce(scanIB, 120);
        addListener(toolKey, window, 'scroll', debounce(updateAllIBBorders, 60), { passive: true });
        addListener(toolKey, window, 'resize', debounce(updateAllIBBorders, 60));
        const sharedIBObserver = new MutationObserver(debouncedScanIB);
        sharedIBObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
        addObserver(toolKey, sharedIBObserver);

        scanIB();
    }

    function removeIBHighlights() {
        cleanupTool('a11y_ib');
        document.querySelectorAll('.A11y-ib-border').forEach(el => el.remove());
    }

    function highlightContrastFailures(container = document.body) {
        const toolKey = 'a11y_contrast';
        let contrastOverlayContainer = document.getElementById('ContrastOverlay-container');
        if (!contrastOverlayContainer) {
            contrastOverlayContainer = document.createElement('div');
            contrastOverlayContainer.id = 'ContrastOverlay-container';
            Object.assign(contrastOverlayContainer.style, {
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 9999
            });
            document.body.appendChild(contrastOverlayContainer);
            addContainer(toolKey, contrastOverlayContainer);
        }

        if (document.querySelector('.ContrastOverlay-border')) return;
        document.querySelectorAll('.ContrastOverlay-border').forEach(e => e.remove());

        const visited = new Set();

        function scanContrast() {
            document.querySelectorAll('.ContrastOverlay-border').forEach(b => b.remove());

            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    if (!node || !node.nodeValue) return NodeFilter.FILTER_REJECT;
                    if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                    const p = node.parentElement;
                    if (!p) return NodeFilter.FILTER_REJECT;
                    if (visited.has(p)) return NodeFilter.FILTER_REJECT;
                    const cs = getComputedStyle(p);
                    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0' || p.hidden) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            }, false);

            visited.clear();
            const toProcess = [];
            while (walker.nextNode()) {
                const p = walker.currentNode.parentElement;
                if (p && !visited.has(p)) {
                    visited.add(p);
                    toProcess.push(p);
                }
            }

            toProcess.forEach(el => {
                const style = window.getComputedStyle(el);
                const text = Array.from(el.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent.trim())
                    .join('');

                if (!text || style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0' || el.hidden) return;

                const color = getEffectiveColor(el, 'color');
                const bg = getEffectiveBackground(el);
                const ratio = contrastRatio(color, bg);

                const fontSize = parseFloat(style.fontSize) || 0;
                const fontWeight = parseInt(style.fontWeight, 10) || 400;
                const isLargeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
                const threshold = isLargeText ? 3.0 : 4.5;

                if (ratio < threshold) {
                    const border = makeBorder(toolKey, 'ContrastOverlay-border A11y-contrast-border');
                    contrastOverlayContainer.appendChild(border);
                    border._a11yTarget = el;

                    function update() {
                        const r = el.getBoundingClientRect();
                        if (isVisible(el)) {
                            border.style.display = 'block';
                            const top = Math.round(r.top - 4);
                            const left = Math.round(r.left - 4);
                            const width = Math.round(r.width + 8);
                            const height = Math.round(r.height + 8);
                            border.style.top = `${top}px`;
                            border.style.left = `${left}px`;
                            border.style.width = `${width}px`;
                            border.style.height = `${height}px`;
                        } else {
                            border.style.display = 'none';
                        }
                    }

                    function highlight() { border.classList.add('ContrastOverlay-highlight'); }
                    function unhighlight() { border.classList.remove('ContrastOverlay-highlight'); }

                    addListener(toolKey, el, 'mouseover', highlight);
                    addListener(toolKey, el, 'mouseout', unhighlight);
                }
            });

            updateAllBorders();
        }

        function updateAllBorders() {
            document.querySelectorAll('.ContrastOverlay-border').forEach(border => {
                const el = border._a11yTarget;
                if (!el) return;
                const r = el.getBoundingClientRect();
                if (isVisible(el)) {
                    border.style.display = 'block';
                    const top = Math.round(r.top - 4);
                    const left = Math.round(r.left - 4);
                    const width = Math.round(r.width + 8);
                    const height = Math.round(r.height + 8);
                    border.style.top = `${top}px`;
                    border.style.left = `${left}px`;
                    border.style.width = `${width}px`;
                    border.style.height = `${height}px`;
                } else {
                    border.style.display = 'none';
                }
            });
        }

        const debouncedScan = debounce(scanContrast, 120);
        addListener(toolKey, window, 'scroll', debounce(updateAllBorders, 60), { passive: true });
        addListener(toolKey, window, 'resize', debounce(updateAllBorders, 60));
        const sharedObserver = new MutationObserver(debouncedScan);
        sharedObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
        addObserver(toolKey, sharedObserver);

        scanContrast();

        function contrastRatio(rgb1, rgb2) {
            const [r1, g1, b1] = (rgb1.match(/\d+/g) || [0,0,0]).map(Number);
            const [r2, g2, b2] = (rgb2.match(/\d+/g) || [255,255,255]).map(Number);
            const lum1 = luminance(r1, g1, b1);
            const lum2 = luminance(r2, g2, b2);
            return lum1 > lum2 ? (lum1 + 0.05) / (lum2 + 0.05) : (lum2 + 0.05) / (lum1 + 0.05);
        }

        function luminance(r, g, b) {
            const a = [r, g, b].map(v => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        }

        function resolveColor(el, property) {
            let current = el;
            while (current && current !== document.documentElement) {
                try {
                    const cs = getComputedStyle(current);
                    let value = cs.getPropertyValue(property).trim();
                    if (value && value !== 'transparent') {
                        const normalized = normalizeColor(value);
                        if (normalized) return normalized;
                    }
                } catch (e) {
                    // ignore and continue walking up
                }
                current = current.parentElement;
            }
            try {
                const bodyVal = getComputedStyle(document.body).getPropertyValue(property).trim();
                return normalizeColor(bodyVal);
            } catch (e) {
                return '';
            }
        }

        function getEffectiveBackground(el) {
            let current = el;
            while (current && current !== document.documentElement) {
                const bg = window.getComputedStyle(current).backgroundColor;
                if (bg && !bg.startsWith('rgba(0, 0, 0, 0)') && bg !== 'transparent') {
                    return normalizeColor(bg);
                }
                current = current.parentElement;
            }
            return normalizeColor(window.getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)');
        }

        function getEffectiveColor(el, property = 'color') {
                let current = el;
                while (current && current !== document.documentElement) {
                    const color = resolveColor(current, property);
                    if (color && color !== 'transparent') {
                        return color;
                    }
                    current = current.parentElement;
                }
                return resolveColor(document.body, property) || 'rgb(0,0,0)';
        }
    }

    function removeContrastHighlights() {
        cleanupTool('a11y_contrast');
        document.querySelectorAll('.ContrastOverlay-border').forEach(el => el.remove());
    }

    // Auto-run on page load
    function waitForUserContent() {
        const observer = new MutationObserver((mutations, obs) => {
            const container = document.body;
            if (container) {
                obs.disconnect();
                setTimeout(() => {
                    Object.values(TOOLS).forEach(tool => {
                        if (shouldAutoRun && GM_getValue(tool.key, true)) {
                            tool.run(container);
                        }
                    });
                }, 2000);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Start
    updateMenuCommands();
    if (shouldAutoRun) {
        waitForUserContent();
    }

})();
