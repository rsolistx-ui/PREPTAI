// PREPT AI — Background Service Worker v2

const PREPT_URL = 'https://preptai.app';

// ── Install: set up context menus ──────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'prept-analyze-selection',
    title: 'Analyze with PREPT AI (selected text)',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'prept-analyze-page',
    title: 'Analyze this page as a job posting',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'prept-separator',
    type: 'separator',
    contexts: ['selection', 'page'],
  });
  chrome.contextMenus.create({
    id: 'prept-open-sidepanel',
    title: 'Open PREPT AI side panel',
    contexts: ['all'],
  });
  updateSavedJobsBadge();
});

// ── Context menu clicks ────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'prept-analyze-selection' && info.selectionText) {
    const jobData = {
      title: '',
      company: '',
      description: info.selectionText,
      source: tab.url,
    };
    await chrome.storage.session.set({ pendingJob: jobData });
    chrome.sidePanel.open({ tabId: tab.id });
    chrome.runtime.sendMessage({ type: 'PENDING_JOB_READY' }).catch(() => {});
  }

  if (info.menuItemId === 'prept-analyze-page') {
    // Ask content script to extract the page
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const body = document.body?.innerText || '';
          const title = document.querySelector('h1')?.innerText?.trim() || document.title;
          return { title, company: '', description: body.slice(0, 8000), source: location.href };
        },
      });
      if (result?.result?.description) {
        await chrome.storage.session.set({ pendingJob: result.result });
        chrome.sidePanel.open({ tabId: tab.id });
      }
    } catch (e) {
      // scripting permission not available for this tab — fall back to popup
      chrome.action.openPopup();
    }
  }

  if (info.menuItemId === 'prept-open-sidepanel') {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ── Messages from content script ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'JOB_DETECTED') {
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#c8a84b', tabId });
    chrome.action.setTitle({ title: 'PREPT AI — Job detected! Click to open.', tabId });
  }

  if (msg.type === 'JOB_CLEARED') {
    updateSavedJobsBadge(tabId);
    chrome.action.setTitle({ title: 'PREPT AI', tabId });
  }

  if (msg.type === 'JOB_SAVED') {
    updateSavedJobsBadge();
  }

  if (msg.type === 'OPEN_SIDEPANEL' && tabId) {
    chrome.sidePanel.open({ tabId });
  }
});

// ── Badge: show saved job count ────────────────────────────────────────────

async function updateSavedJobsBadge(tabId) {
  const { savedJobs = [] } = await chrome.storage.local.get('savedJobs');
  const count = savedJobs.length;
  const text = count > 0 ? String(count) : '';
  const color = count > 0 ? '#7b6df4' : '#888';
  if (tabId) {
    chrome.action.setBadgeText({ text, tabId });
    chrome.action.setBadgeBackgroundColor({ color, tabId });
  } else {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
  }
}
