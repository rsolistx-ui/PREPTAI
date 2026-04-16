// PREPT AI — Background Service Worker

// Update badge when a job is detected
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'JOB_DETECTED') {
    chrome.action.setBadgeText({ text: '1', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#c8a84b', tabId: sender.tab.id });
    chrome.action.setTitle({ title: 'PREPT AI — Job detected!', tabId: sender.tab.id });
  }
  if (msg.type === 'JOB_CLEARED') {
    chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
    chrome.action.setTitle({ title: 'PREPT AI', tabId: sender.tab.id });
  }
});
