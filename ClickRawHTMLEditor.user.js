// ==UserScript==
// @name         Click Raw HTML Editor
// @namespace    http://tampermonkey.net/
// @version      2025-12-04
// @description  Automatically select the raw HTML editor option on Canvas edit pages
// @author       Wyatt Nilsson
// @match https://byu.instructure.com/courses/*
// @match https://byuis.instructure.com/courses/*
// @match https://byuismastercourses.instructure.com/courses/*
// @match https://byuohs.instructure.com/courses/*
// @icon         https://assets.topadvisor.com/media/_solution_logo_03202023_46576647.png
// @updateURL    https://raw.githubusercontent.com/WyWyGuy/tampermonkey-auto-a11y-tools-script/main/ClickRawHTMLEditor.user.js
// @downloadURL  https://raw.githubusercontent.com/WyWyGuy/tampermonkey-auto-a11y-tools-script/main/ClickRawHTMLEditor.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Run only on edit pages
    if (!location.pathname.endsWith('/edit')) return;

    // Helper: wait for element to appear
    function waitForSelector(selector, callback) {
        const el = document.querySelector(selector);
        if (el) {
            callback(el);
        } else {
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    callback(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    // Step 1: click "Switch to rich text editor" after 0.5s
    waitForSelector('button[data-btn-id="rce-edit-btn"]', btn => {
        setTimeout(() => {
            btn.click();

            // Step 2: after clicking, look for "Switch to raw HTML Editor"
            waitForSelector('button[data-btn-id="rce-editormessage-btn"]', rawBtn => {
                if (rawBtn.textContent.toLowerCase().includes('raw html')) {
                    setTimeout(() => {
                        rawBtn.click();
                    }, 500); // 0.5s delay before clicking raw HTML editor
                }
            });
        }, 500); // 0.5s delay before clicking rich text editor
    });
})();
