// ==UserScript==
// @name         Download SLA Spreadsheets
// @namespace    http://tampermonkey.net/
// @version      2025-11-20
// @description  Automate downloading Excel spreadsheets from Teamwork
// @author       Wyatt Nilsson
// @match        https://byuis.teamwork.com/*
// @icon         https://cdn-lightspeed.teamwork.com/favicon.ico
// @grant        GM_registerMenuCommand
// ==/UserScript==

function sleep(ms = 50) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForFocus() {
    return new Promise(resolve => {
        if (document.hasFocus()) {
            resolve();
        } else {
            const onFocus = () => {
                window.removeEventListener("focus", onFocus);
                resolve();
            };
            window.addEventListener("focus", onFocus);
        }
    });
}

function waitForElement(tagName, attributeName, attributeValue, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const selector = `${tagName}[${attributeName}="${attributeValue}"]`;
        const existing = document.querySelector(selector);
        if (existing) {
            return resolve(existing);
        }
        const observer = new MutationObserver((mutations, obs) => {
            const found = document.querySelector(selector);
            if (found) {
                obs.disconnect();
                resolve(found);
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Tampermonkey: Timeout: <${tagName}> with ${attributeName}="${attributeValue}" not found within ${timeout}ms`));
        }, timeout);
    });
}

function waitForTextMatch(tagName, text, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const check = () => {
            const elements = Array.from(document.getElementsByTagName(tagName));
            const match = elements.find(el => el.textContent.trim() === text);
            if (match) return match;
        };
        const existing = check();
        if (existing) return resolve(existing);
        const observer = new MutationObserver((_, obs) => {
            const found = check();
            if (found) {
                obs.disconnect();
                resolve(found);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Tampermonkey: Timeout: <${tagName}> with text "${text}" not found within ${timeout}ms`));
        }, timeout);
    });
}

async function downloadSLA() {

    //Filter out the main window since Teamwork loads in an iframe
    const includedPath = "https://byuis.teamwork.com/#/everything/tasks";
    if (window.location.href != includedPath) {
        return;
    }

    //Open the filter menu if it isn't already
    window.focus();
    const savedFilterLinks = Array.from(document.querySelectorAll('a')).filter(link => link.textContent.trim().includes('Saved Filters'));
    if (savedFilterLinks.length <= 0) {
        const openFiltersButton = document.querySelector('[aria-label="Open Filters"]');
        if (openFiltersButton) {
            openFiltersButton.click();
            await waitForElement('div', 'class', 'saved-filter');
            await sleep();
        } else {
            console.warn('Tampermonkey: Could not open the filter menu');
            return
        }
    }

    //Loop through SLA filters and click the download button for each
    const failedDownloads = [];
    const SLAFilters = ["SLA - Prototypes", "SLA - 50% Reviews", "SLA - PSIAs", "SLA - Peer Verifications"];
    for (const textMatch of SLAFilters) {
        const matchingSpans = Array.from(document.querySelectorAll('span.saved-filter__title')).filter(span => span.textContent.trim().includes(textMatch));
        if (matchingSpans.length > 0) {
            for (const span of matchingSpans) {
                const grandparent = span.parentElement?.parentElement;
                if (grandparent && !grandparent.classList.contains("selected")) {
                    span.click();
                }
                await sleep(textMatch == SLAFilters[0] ? 500 : undefined);
                await waitForElement('div', 'id', 'alltasksWrapper', 10000);
                await waitForElement('button', 'aria-label', 'More Options');
                await sleep(textMatch == SLAFilters[0] ? 500 : undefined);
                const moreOptionsBtn = document.querySelector('[aria-label="More Options"]');
                if (moreOptionsBtn) {
                    moreOptionsBtn.click();
                } else {
                    console.warn('Tampermonkey: More Options button not found');
                    failedDownloads.push(textMatch);
                    continue;
                }
                await waitForTextMatch('span', 'Export');
                await sleep(textMatch == SLAFilters[0] ? 500 : undefined);
                const exportSpan = Array.from(document.querySelectorAll('span')).find(el => el.textContent.trim() === "Export");
                if (exportSpan) {
                    const mouseOverEvent = new MouseEvent('mouseover', {
                        bubbles: true,
                        cancelable: true,
                    });
                    exportSpan.dispatchEvent(mouseOverEvent);
                } else {
                    console.warn('Tampermonkey: "Export" span not found');
                    failedDownloads.push(textMatch);
                    continue;
                }
                await waitForTextMatch('span', 'to Excel');
                await sleep();
                const toExcelSpan = Array.from(document.querySelectorAll('span')).find(el => el.textContent.trim() === "to Excel");
                if (toExcelSpan) {
                    toExcelSpan.click();
                } else {
                    console.warn('Tampermonkey: "to Excel" span not found');
                    failedDownloads.push(textMatch);
                    continue
                }
            }
        } else {
            console.warn(`Tampermonkey: No span found for "${textMatch}"`);
            failedDownloads.push(textMatch);
            continue
        }
        await waitForFocus();
        await sleep();
    }
    if (failedDownloads.length > 0) {
        alert(`The following were not downloaded.\nPlease download these manually:\n\n${failedDownloads.map(s => s.replace(/^SLA - /, "")).join("\n")}`);
    }
}

GM_registerMenuCommand("Download SLA Documents", downloadSLA);
