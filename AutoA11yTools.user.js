// ==UserScript==
// @name         Auto A11y Tools
// @namespace    http://tampermonkey.net/
// @version      2025-10-30
// @description  Automatically run a11y tools
// @author       Wyatt Nilsson (Original header, alt text, and iframe a11y tools are not mine)
// @match        *://*/*
// @icon         https://www.bookmarks.design//media/image/a11yproject.jpg
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_unregisterMenuCommand
// @updateURL    https://github.com/WyWyGuy/tampermonkey-auto-a11y-tools-script/raw/refs/heads/main/AutoA11yTools.user.js
// @downloadURL  https://github.com/WyWyGuy/tampermonkey-auto-a11y-tools-script/raw/refs/heads/main/AutoA11yTools.user.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;

    const autoRunDomains = [
        'byu.instructure.com',
        'byuis.instructure.com',
        'byuismastercourses.instructure.com',
        'byuohs.instructure.com'
    ];

    const excludedPath = /^https:\/\/byu\.instructure\.com\/courses\/1026(\/|$)/; //Exclude training course
    const currentHost = window.location.hostname;
    const isAutoRunDomain = autoRunDomains.includes(currentHost);
    const isExcludedPage = excludedPath.test(window.location.href);
    const shouldAutoRun = isAutoRunDomain && !isExcludedPage;

    let tempToolStates = {};

    //Central tool tracking object
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

    Object.values(TOOLS).forEach(tool => {
        if (GM_getValue(tool.key) === undefined) {
            GM_setValue(tool.key, true);
        }
    });

    let menuIds = {};

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

    function isVisible(el) {
        if (!(el instanceof Element)) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return !!(el.offsetParent || r.width > 0 || r.height > 0);
    }

    function runImageAltOverlay(container) {
        if (document.querySelector('.A11y-img-label')) return;

        container.querySelectorAll('img').forEach(function (img) {
            const alt = img.alt ? img.alt.trim() : 'None';

            const label = document.createElement('div');
            label.className = 'AccessibilityHelper A11y-img-label';
            label.textContent = 'Alt Text: ' + alt;
            Object.assign(label.style, {
                position: 'absolute',
                background: '#FFF',
                border: '3px solid #CCC',
                borderRadius: '7px',
                padding: '5px',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                fontSize: '12px',
                width: '150px',
                zIndex: '9999',
                display: 'none',
                color: 'black'
            });

            const border = document.createElement('div');
            border.className = 'AccessibilityHelper A11y-img-border';
            Object.assign(border.style, {
                position: 'absolute',
                border: '3px solid #CCC',
                borderRadius: '7px',
                zIndex: '9998',
                display: 'none',
                pointerEvents: 'none',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
            });

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

            [img, label].forEach(el => {
                el.addEventListener('mouseover', highlight);
                el.addEventListener('mouseout', unhighlight);
            });

            document.body.appendChild(label);
            document.body.appendChild(border);
            updatePositions();
            window.addEventListener('scroll', updatePositions);
            window.addEventListener('resize', updatePositions);
            new MutationObserver(updatePositions).observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'hidden', 'src']
            });
        });
    }

    function removeImageAltOverlay() {
        document.querySelectorAll('.A11y-img-label, .A11y-img-border').forEach(el => el.remove());
    }

    function runIframeLabelOverlay(container) {
        if (document.querySelector('.A11y-iframe-label')) return;

        container.querySelectorAll('iframe').forEach(function (f) {
            const labelText = f.getAttribute('aria-label') || f.title || '[Missing]';
            const prefix = f.hasAttribute('aria-label') ? 'Aria-label: ' : 'Title: ';

            const label = document.createElement('div');
            label.textContent = prefix + labelText;
            label.className = 'AccessibilityHelper A11y-iframe-label';
            label.style.cssText = 'position:absolute;background:#FFF;border:3px solid #CCC;border-radius:7px;padding:5px;text-align:left;white-space:pre-wrap;width:300px;font-size:12px;z-index:9999;transition:all 0.2s ease;display:none;';

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

            label.addEventListener('mouseover', highlight);
            label.addEventListener('mouseout', unhighlight);
            border.addEventListener('mouseover', highlight);
            border.addEventListener('mouseout', unhighlight);

            document.body.appendChild(label);
            document.body.appendChild(border);
            update();
            window.addEventListener('scroll', update);
            window.addEventListener('resize', update);
            new MutationObserver(update).observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'open']
            });
        });
    }

    function removeIframeLabelOverlay() {
        document.querySelectorAll('.A11y-iframe-label, .A11y-iframe-border').forEach(el => el.remove());
    }

    function runHeadingTagOverlay(container) {
        if (document.querySelector('.A11y-heading-label')) return;

        if (!document.getElementById('accessibility-helper-style')) {
            const style = document.createElement('style');
            style.id = 'accessibility-helper-style';
            style.textContent = `
        .AccessibilityHelper-label {
          background: #FFF;
          border: 3px solid #CCC;
          border-radius: 4px;
          padding: 2px 4px;
          position: absolute;
          white-space: nowrap;
          font-size: 12px;
          z-index: 10001;
          color: black;
          transition: all 0.2s ease;
          display: none;
        }
        .AccessibilityHelper-border {
          position: absolute;
          border: 3px solid #CCC;
          border-radius: 4px;
          z-index: 9999;
          pointer-events: none;
          transition: all 0.2s ease;
          display: none;
        }
        .AccessibilityHelper-highlight {
          border-color: #393 !important;
          box-shadow: 1px 2px 5px #CCC;
        }
      `;
            document.head.appendChild(style);
        }

        document.querySelectorAll('.AccessibilityHelper-label,.AccessibilityHelper-border').forEach(e => e.remove());

        ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].flatMap(tag => [...container.querySelectorAll(tag)]).forEach(h => {
            const label = document.createElement('div');
            label.className = 'AccessibilityHelper AccessibilityHelper-label A11y-heading-label';
            label.textContent = h.tagName;

            const border = document.createElement('div');
            border.className = 'AccessibilityHelper AccessibilityHelper-border A11y-heading-border';

            document.body.appendChild(label);
            document.body.appendChild(border);

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

            label.addEventListener('mouseover', highlight);
            label.addEventListener('mouseout', unhighlight);
            h.addEventListener('mouseover', highlight);
            h.addEventListener('mouseout', unhighlight);

            update();
            window.addEventListener('scroll', update);
            window.addEventListener('resize', update);
            new MutationObserver(update).observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'hidden', 'open']
            });
        });
    }

    function removeHeadingOverlay() {
        document.querySelectorAll('.A11y-heading-label, .A11y-heading-border').forEach(el => el.remove());
    }

    function runIBTagOverlay(container) {
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
        }

        if (document.querySelector('.A11y-ib-border')) return;

        if (!document.getElementById('ib-overlay-style')) {
            const style = document.createElement('style');
            style.id = 'ib-overlay-style';
            style.textContent = `
    .IBOverlay-border {
        position: absolute;
        border: 2px solid red;
        border-radius: 4px;
        z-index: 9999;
        pointer-events: none;
        transition: all 0.2s ease;
        display: none;
    }
    .IBOverlay-highlight {
        border-color: #c00 !important;
        box-shadow: 1px 2px 5px #f99;
    }
    `;
            document.head.appendChild(style);
        }

        document.querySelectorAll('.AccessibilityHelper-border.A11y-ib-border').forEach(e => e.remove());

        container.querySelectorAll('i, b').forEach(el => {
            const text = Array.from(el.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent.trim())
            .join('');
            if (!text) return;

            const border = document.createElement('div');
            border.className = 'AccessibilityHelper IBOverlay-border A11y-ib-border';

            ibOverlayContainer.appendChild(border);

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

            function highlight() {
                border.classList.add('IBOverlay-highlight');
            }
            function unhighlight() {
                border.classList.remove('IBOverlay-highlight');
            }

            el.addEventListener('mouseover', highlight);
            el.addEventListener('mouseout', unhighlight);

            update();
            window.addEventListener('scroll', update);
            window.addEventListener('resize', update);
            const observer = new MutationObserver(mutations => {
                const causedByOverlay = mutations.some(m =>
                                                       m.target.closest('#IBOverlay-container')
                                                      );
                if (!causedByOverlay) update();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'hidden']
            });

        });
    }

    function removeIBHighlights() {
        document.querySelectorAll('.A11y-ib-border').forEach(el => el.remove());
    }

    function highlightContrastFailures(container = document.body) {
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
        }

        if (document.querySelector('.ContrastOverlay-border')) return;

        if (!document.getElementById('contrast-overlay-style')) {
            const style = document.createElement('style');
            style.id = 'contrast-overlay-style';
            style.textContent = `
        .ContrastOverlay-border {
            position: absolute;
            border: 2px solid green;
            border-radius: 4px;
            z-index: 9999;
            pointer-events: none;
            transition: all 0.2s ease;
            display: none;
        }
        .ContrastOverlay-highlight {
            border-color: #393 !important;
            box-shadow: 1px 2px 5px #9f9;
        }
        `;
            document.head.appendChild(style);
        }

        document.querySelectorAll('.ContrastOverlay-border').forEach(e => e.remove());

        container.querySelectorAll('*').forEach(el => {
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
                const border = document.createElement('div');
                border.className = 'AccessibilityHelper ContrastOverlay-border A11y-contrast-border';

                contrastOverlayContainer.appendChild(border);

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

                function highlight() {
                    border.classList.add('ContrastOverlay-highlight');
                }

                function unhighlight() {
                    border.classList.remove('ContrastOverlay-highlight');
                }

                el.addEventListener('mouseover', highlight);
                el.addEventListener('mouseout', unhighlight);

                update();
                window.addEventListener('scroll', update);
                window.addEventListener('resize', update);
                const observer = new MutationObserver(mutations => {
                    const causedByOverlay = mutations.some(m => {
                        return (
                            m.target.classList?.contains('ContrastOverlay-border') ||
                            m.target.closest('.ContrastOverlay-border')
                        );
                    });
                    if (!causedByOverlay) {
                        update();
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style', 'class', 'hidden']
                });
            }
        });

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
            const style = getComputedStyle(el);
            let value = style.getPropertyValue(property).trim();

            const varMatch = value.match(/var\((--[^,)]+)/);
            if (varMatch) {
                const varName = varMatch[1];
                const resolved = style.getPropertyValue(varName).trim();
                if (resolved) return resolved;
            }

            return value;
        }

        function getEffectiveBackground(el) {
            let current = el;
            while (current && current !== document.documentElement) {
                const bg = window.getComputedStyle(current).backgroundColor;
                if (bg && !bg.startsWith('rgba(0, 0, 0, 0)') && bg !== 'transparent') {
                    return bg;
                }
                current = current.parentElement;
            }
            return window.getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)';
        }

        function getEffectiveColor(el) {
            let current = el;
            while (current && current !== document.documentElement) {
                const color = resolveColor(current, 'color');
                if (color && color !== 'rgb(39, 53, 64)' && color !== 'transparent') {
                    return color;
                }
                current = current.parentElement;
            }
            return resolveColor(document.body, 'color');
        }
    }

    function removeContrastHighlights() {
        document.querySelectorAll('.ContrastOverlay-border').forEach(el => el.remove());
    }

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

    updateMenuCommands();
    if (shouldAutoRun) {
        waitForUserContent();
    }

})();
