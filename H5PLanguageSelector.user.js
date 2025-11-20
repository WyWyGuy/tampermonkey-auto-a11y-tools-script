// ==UserScript==
// @name         H5P Language Selector
// @namespace    http://tampermonkey.net/
// @version      2025-11-20
// @description  Scroll to a certain language in the H5P dropdown menu, or use ctrl + q to apply it automatically (robust version)
// @author       Wyatt Nilsson
// @match        https://byu.h5p.com/*
// @icon         https://i0.wp.com/www.aufieroinformatica.com/wp-content/uploads/sites/7/2025/06/h5p_logo.png?fit=195%2C195&ssl=1
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const TARGET_TEXT = "chinese, simplified"; // partial match, case-insensitive
    const visiblePanels = new WeakSet();

    // Recursively query inside shadow roots
    function deepQueryAll(root, selector) {
        const results = Array.from((root.querySelectorAll && root.querySelectorAll(selector)) || []);
        const treeWalker = (root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : []);
        for (const el of treeWalker) {
            if (el.shadowRoot) {
                results.push(...deepQueryAll(el.shadowRoot, selector));
            }
        }
        return results;
    }

    // Find the visible panel element (supports ck-on, ck-dropdown__panel-visible)
    function findVisiblePanel(doc) {
        const candidates = deepQueryAll(doc, '.ck-dropdown__panel, .ck-dropdown__panel-visible, .ck-dropdown__panel.ck-on');
        return candidates.find(p => {
            try {
                return p.classList && (p.classList.contains('ck-on') || p.classList.contains('ck-dropdown__panel-visible') || getComputedStyle(p).display !== 'none' && p.offsetParent !== null);
            } catch (err) {
                return false;
            }
        }) || null;
    }

    // Scroll panel so target label/button is visible
    function scrollDropdownPanel(panel) {
        if (!panel) return;
        const listItems = deepQueryAll(panel, '.ck-list__item');
        const targetItem = listItems.find(item => (item.textContent || '').toLowerCase().includes(TARGET_TEXT.toLowerCase()));

        const scrollable = panel.querySelector('.ck-list__items') || panel;
        if (targetItem) {
            // prefer the actual button
            const btn = targetItem.querySelector('button') || targetItem.querySelector('.ck-button') || targetItem;
            if (!btn) return;
            // compute offset relative to scrollable
            try {
                const btnRect = btn.getBoundingClientRect();
                const containerRect = scrollable.getBoundingClientRect();
                // center the button vertically in the visible area if possible
                const desired = scrollable.scrollTop + (btnRect.top - containerRect.top) - (containerRect.height / 2) + (btnRect.height / 2);
                scrollable.scrollTop = Math.max(0, Math.round(desired));
            } catch (err) {
                // fallback
                try { scrollable.scrollTop = btn.offsetTop; } catch (e) {}
            }
        } else {
            // fallback: scroll to bottom
            scrollable.scrollTop = scrollable.scrollHeight;
        }
    }

    // Helper to synthesize real mouse events on an element
    function synthesizeClick(el) {
        if (!el) return;
        try {
            // focus first
            if (typeof el.focus === 'function') el.focus();

            const evInit = { bubbles: true, cancelable: true, composed: true };
            el.dispatchEvent(new MouseEvent('pointerdown', evInit));
            el.dispatchEvent(new MouseEvent('mousedown', evInit));
            el.dispatchEvent(new MouseEvent('pointerup', evInit));
            el.dispatchEvent(new MouseEvent('mouseup', evInit));
            // finally click
            el.dispatchEvent(new MouseEvent('click', evInit));
        } catch (err) {
            try { el.click(); } catch (e) {}
        }
    }

    // Return the actual clickable element for the target language inside the panel
    function findLanguageButton(panel) {
        if (!panel) return null;
        const items = deepQueryAll(panel, '.ck-list__item');
        const targetItem = items.find(item => (item.textContent || '').toLowerCase().includes(TARGET_TEXT.toLowerCase()));
        if (!targetItem) return null;

        // Prefer actual button element
        const button = targetItem.querySelector('button') || targetItem.querySelector('[role="option"]') || targetItem.querySelector('.ck-button') || targetItem;
        return button;
    }

    // Try to select the language
    function selectLanguage(panel) {
        if (!panel) { console.log('selectLanguage: no panel'); return false; }
        const btn = findLanguageButton(panel);
        if (!btn) {
            console.log("Language not found in panel:", TARGET_TEXT);
            return false;
        }

        console.log("selectLanguage: found target element:", btn, "text:", (btn.textContent || '').trim());

        // scroll into view with our robust scroll helper
        scrollDropdownPanel(panel);

        // Try to synthesize real clicks. Do a small delay so CKEditor can attach handlers if needed.
        setTimeout(() => {
            synthesizeClick(btn);
        }, 10);

        // Also try pressing Enter on the focused element after a short delay (fallback)
        setTimeout(() => {
            try {
                const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, composed: true });
                btn.dispatchEvent(ev);
            } catch (err) {}
        }, 30);

        return true;
    }

    // Initialize observers + key handlers for a document (iframe document or top)
    function initDropdownObserver(doc) {
        if (!doc) return;

        // Periodic observer to auto-scroll visible panels
        setInterval(() => {
            try {
                const panels = deepQueryAll(doc, '.ck-dropdown__panel, .ck-dropdown__panel-visible, .ck-dropdown__panel.ck-on');
                panels.forEach(panel => {
                    const isVisible = panel.classList && (panel.classList.contains('ck-on') || panel.classList.contains('ck-dropdown__panel-visible')) ||
                                      (panel.offsetParent !== null && getComputedStyle(panel).display !== 'none');

                    if (isVisible && !visiblePanels.has(panel)) {
                        // New panel opened
                        scrollDropdownPanel(panel);
                        visiblePanels.add(panel);
                    }

                    if (!isVisible && visiblePanels.has(panel)) {
                        visiblePanels.delete(panel);
                    }
                });
            } catch (err) {}
        }, 100);

        // Key handler that listens for Ctrl+Q
        const targetWin = doc.defaultView;

        function keyHandler(e) {
            try {
                if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyQ') {
                    e.preventDefault();

                    // 1) If a visible panel already exists, use it
                    let panel = findVisiblePanel(doc);
                    if (panel) {
                        const ok = selectLanguage(panel);
                        if (ok) return;
                    }

                    // 2) Otherwise, find the "Language" dropdown button and open it
                    const possibleButtons = deepQueryAll(doc, '.ck-dropdown__button, button[aria-label], button');
                    const langButton = possibleButtons.find(b => {
                        try {
                            const aria = b.getAttribute && b.getAttribute('aria-label');
                            const text = (b.textContent || '').toLowerCase();
                            return (aria && aria.toLowerCase().includes('language')) || text.includes('language');
                        } catch (err) { return false; }
                    });

                    if (!langButton) {
                        console.log('H5P-LangSelector: language dropdown button not found.');
                        return;
                    }

                    synthesizeClick(langButton);

                    // 3) Wait for items to appear in the visible panel, then select
                    const waiter = setInterval(() => {
                        const visiblePanel = findVisiblePanel(doc);
                        if (!visiblePanel) return;
                        const items = deepQueryAll(visiblePanel, '.ck-list__item');
                        if (items.length > 0) {
                            clearInterval(waiter);
                            selectLanguage(visiblePanel);
                        }
                    }, 30);
                }
            } catch (err) {}
        }

        // Attach to both document and window to catch focus/keydown variations
        try { doc.addEventListener('keydown', keyHandler, true); } catch (err) {}
        try { targetWin.addEventListener('keydown', keyHandler, true); } catch (err) {}

        // For visibility: log that we attached to this doc
        try { console.log('H5P-LangSelector: attached to doc', doc.location && doc.location.href); } catch (e) { console.log('H5P-LangSelector: attached to doc (no href)'); }
    }

    function attachToIframe(iframe) {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc) return;
            initDropdownObserver(doc);
        } catch (err) {
            // cross-origin iframe; ignore
        }
    }

    // Attach to existing iframes first
    document.querySelectorAll('iframe').forEach(attachToIframe);

    // Observe new iframes added later
    new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (n instanceof HTMLIFrameElement) attachToIframe(n);
            }
        }
    }).observe(document.body, { childList: true, subtree: true });

    // also attach to top-level document (some H5P editors might not be inside iframes)
    try { initDropdownObserver(document); } catch (e) {}

})();
