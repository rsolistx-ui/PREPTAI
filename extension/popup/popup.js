// PREPT AI Extension Popup

const PREPT_URL = 'https://preptai.app';

function encodeJob(data) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  } catch {
    return '';
  }
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len).trimEnd() + '\u2026' : str;
}

function openPrept(page, jobData) {
  const encoded = encodeJob(jobData);
  if (!encoded) return;
  const url = `${PREPT_URL}/${page}#prept=${encoded}`;
  chrome.tabs.create({ url });
}

// ── Detected job view ──────────────────────────────────────────────────────

async function tryLoadDetectedJob() {
  let result;
  try {
    result = await chrome.storage.session.get(['detectedJob', 'detectedUrl']);
  } catch {
    return false;
  }

  const { detectedJob: job, detectedUrl: url } = result || {};
  if (!job || !job.description) return false;

  // Show detected view
  document.getElementById('view-detected').classList.remove('hidden');
  document.getElementById('view-manual').classList.add('hidden');

  document.getElementById('det-title').textContent = truncate(job.title, 70) || 'Untitled position';
  document.getElementById('det-company').textContent = truncate(job.company, 60) || 'Unknown company';

  try {
    const domain = url ? new URL(url).hostname.replace('www.', '') : '';
    document.getElementById('det-source').textContent = domain || '';
  } catch {}

  document.getElementById('btn-det-optimize').addEventListener('click', () =>
    openPrept('prept_match_v2.html', job)
  );

  document.getElementById('btn-det-coach').addEventListener('click', () =>
    openPrept('prept_v2.html', job)
  );

  document.getElementById('btn-switch-manual').addEventListener('click', () => {
    document.getElementById('view-detected').classList.add('hidden');
    document.getElementById('view-manual').classList.remove('hidden');
  });

  return true;
}

// ── Manual input view ──────────────────────────────────────────────────────

function initManualView() {
  const jdEl      = document.getElementById('manual-jd');
  const titleEl   = document.getElementById('manual-title');
  const companyEl = document.getElementById('manual-company');
  const charCount = document.getElementById('jd-chars');
  const btnOpt    = document.getElementById('btn-man-optimize');
  const btnCoach  = document.getElementById('btn-man-coach');

  function update() {
    const hasContent = jdEl.value.trim().length > 30;
    btnOpt.disabled   = !hasContent;
    btnCoach.disabled = !hasContent;
    charCount.textContent = jdEl.value.length.toLocaleString();
  }

  jdEl.addEventListener('input', update);

  btnOpt.addEventListener('click', () => {
    openPrept('prept_match_v2.html', {
      title: titleEl.value.trim(),
      company: companyEl.value.trim(),
      description: jdEl.value.trim(),
    });
  });

  btnCoach.addEventListener('click', () => {
    openPrept('prept_v2.html', {
      title: titleEl.value.trim(),
      company: companyEl.value.trim(),
      description: jdEl.value.trim(),
    });
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initManualView();

  const hasDetected = await tryLoadDetectedJob();
  if (!hasDetected) {
    // Default to manual view
    document.getElementById('view-manual').classList.remove('hidden');
  }
});
