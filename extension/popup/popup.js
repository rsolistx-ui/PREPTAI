// PREPT AI Popup v2

const PREPT_URL = 'https://preptai.app';

function encodeJob(data) {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))); }
  catch { return ''; }
}

function openPrept(page, jobData) {
  const encoded = encodeJob(jobData);
  if (!encoded) return;
  chrome.tabs.create({ url: `${PREPT_URL}/${page}#prept=${encoded}` });
  window.close();
}

// ── Open side panel for current tab ───────────────────────────────────────
document.getElementById('btn-sidepanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.sidePanel.open({ tabId: tab.id });
  window.close();
});

// ── Detected job ───────────────────────────────────────────────────────────
async function loadDetected() {
  const result = await chrome.storage.session.get(['detectedJob', 'detectedUrl']);
  const job = result.detectedJob;
  if (!job?.description) return;

  document.getElementById('detected-banner').classList.remove('hidden');
  document.getElementById('det-title').textContent =
    job.title ? (job.title.length > 55 ? job.title.slice(0, 55) + '…' : job.title) : 'Untitled';
  document.getElementById('det-company').textContent = job.company || '';

  // Show direct action buttons alongside side panel CTA
  document.getElementById('btn-optimize').classList.remove('hidden');
  document.getElementById('btn-coach').classList.remove('hidden');

  document.getElementById('btn-optimize').addEventListener('click', () => openPrept('prept_match_v2.html', job));
  document.getElementById('btn-coach').addEventListener('click', () => openPrept('prept_v2.html', job));
}

// ── Manual input ───────────────────────────────────────────────────────────
const jdEl = document.getElementById('manual-jd');
const btnManOpt = document.getElementById('btn-man-opt');
const btnManCoach = document.getElementById('btn-man-coach');

jdEl.addEventListener('input', () => {
  const ok = jdEl.value.trim().length > 30;
  btnManOpt.disabled = !ok;
  btnManCoach.disabled = !ok;
});

btnManOpt.addEventListener('click', () => {
  openPrept('prept_match_v2.html', {
    title: document.getElementById('manual-title').value.trim(),
    company: document.getElementById('manual-company').value.trim(),
    description: jdEl.value.trim(),
  });
});
btnManCoach.addEventListener('click', () => {
  openPrept('prept_v2.html', {
    title: document.getElementById('manual-title').value.trim(),
    company: document.getElementById('manual-company').value.trim(),
    description: jdEl.value.trim(),
  });
});

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadDetected);
