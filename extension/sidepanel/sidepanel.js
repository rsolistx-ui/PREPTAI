// PREPT AI Side Panel

const PREPT_URL = 'https://preptai.app';

function encodeJob(data) {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))); }
  catch { return ''; }
}

function openPrept(page, jobData, hash = '') {
  const encoded = encodeJob(jobData);
  if (!encoded) return;
  const url = `${PREPT_URL}/${page}#prept=${encoded}${hash}`;
  chrome.tabs.create({ url });
}

function relTime(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'Just now';
  if (d < 3600000) return `${Math.round(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.round(d / 3600000)}h ago`;
  return `${Math.round(d / 86400000)}d ago`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Tab switching ──────────────────────────────────────────────────────────

document.querySelectorAll('.sp-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const id = tab.dataset.tab;
    document.querySelectorAll('.sp-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.sp-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${id}`));
    if (id === 'saved') renderSaved();
  });
});

// ── Analyze tab ────────────────────────────────────────────────────────────

let currentJob = null;

async function loadCurrentJob() {
  // Check for pending job (set by context menu / background script)
  let result = await chrome.storage.session.get(['detectedJob', 'detectedAt', 'detectedUrl', 'pendingJob']);
  const job = result.pendingJob || result.detectedJob;

  if (job && job.description) {
    currentJob = job;
    showDetectedJob(job, result.detectedUrl || '');

    // Clear pending after consuming
    if (result.pendingJob) {
      await chrome.storage.session.remove('pendingJob');
    }
  } else {
    showNoJob();
  }
}

function showDetectedJob(job, url) {
  document.getElementById('detected-section').classList.remove('hidden');
  document.getElementById('no-job-section').classList.add('hidden');

  document.getElementById('sp-title').textContent = job.title || 'Untitled position';
  document.getElementById('sp-company').textContent = job.company || 'Unknown company';

  try {
    const domain = url ? new URL(url).hostname.replace('www.', '') : '';
    document.getElementById('sp-source').textContent = domain || '';
  } catch {}

  // Keywords
  const kws = job.keywords || [];
  const kwSection = document.getElementById('kw-section');
  const kwContainer = document.getElementById('sp-keywords');
  if (kws.length) {
    kwSection.classList.remove('hidden');
    kwContainer.innerHTML = kws.map(k => `<span class="sp-kw">${esc(k)}</span>`).join('');
  } else {
    kwSection.classList.add('hidden');
  }

  // Save state
  updateSaveBtn(job);
}

function showNoJob() {
  document.getElementById('detected-section').classList.add('hidden');
  document.getElementById('no-job-section').classList.remove('hidden');
}

// ── Analyze buttons ────────────────────────────────────────────────────────

document.getElementById('btn-optimize').addEventListener('click', () => {
  if (currentJob) openPrept('prept_match_v2.html', currentJob);
});
document.getElementById('btn-coach').addEventListener('click', () => {
  if (currentJob) openPrept('prept_v2.html', currentJob);
});
document.getElementById('btn-cover').addEventListener('click', () => {
  if (currentJob) openPrept('prept_match_v2.html', currentJob, '&tool=coverletter');
});
document.getElementById('btn-skills').addEventListener('click', () => {
  if (currentJob) openPrept('prept_match_v2.html', currentJob, '&tool=skillsgap');
});
document.getElementById('btn-salary').addEventListener('click', () => {
  if (currentJob) openPrept('prept_v2.html', currentJob, '&tool=salary');
});
document.getElementById('btn-linkedin').addEventListener('click', () => {
  if (currentJob) openPrept('prept_v2.html', currentJob, '&tool=linkedin');
});

// ── Save job ───────────────────────────────────────────────────────────────

function jobKey(job) {
  return (job.title + '|' + job.company).toLowerCase().trim();
}

async function updateSaveBtn(job) {
  const { savedJobs = [] } = await chrome.storage.local.get('savedJobs');
  const saved = savedJobs.some(j => jobKey(j) === jobKey(job));
  const btn = document.getElementById('btn-save');
  btn.classList.toggle('saved', saved);
  document.getElementById('save-label').textContent = saved ? '✓ Saved' : 'Save this job';
}

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!currentJob) return;
  const key = jobKey(currentJob);
  const { savedJobs = [] } = await chrome.storage.local.get('savedJobs');
  const idx = savedJobs.findIndex(j => jobKey(j) === key);

  if (idx >= 0) {
    savedJobs.splice(idx, 1);
  } else {
    savedJobs.unshift({ ...currentJob, savedAt: Date.now() });
  }

  await chrome.storage.local.set({ savedJobs: savedJobs.slice(0, 100) });
  updateSaveBtn(currentJob);
  updateSavedBadge();
});

// ── Manual input ───────────────────────────────────────────────────────────

const manJd = document.getElementById('manual-jd');
const manTitle = document.getElementById('manual-title');
const manCompany = document.getElementById('manual-company');
const btnManOpt = document.getElementById('btn-man-optimize');
const btnManCoach = document.getElementById('btn-man-coach');

manJd.addEventListener('input', () => {
  const ok = manJd.value.trim().length > 30;
  btnManOpt.disabled = !ok;
  btnManCoach.disabled = !ok;
});

btnManOpt.addEventListener('click', () => {
  openPrept('prept_match_v2.html', {
    title: manTitle.value.trim(),
    company: manCompany.value.trim(),
    description: manJd.value.trim(),
  });
});
btnManCoach.addEventListener('click', () => {
  openPrept('prept_v2.html', {
    title: manTitle.value.trim(),
    company: manCompany.value.trim(),
    description: manJd.value.trim(),
  });
});

// ── Saved Jobs tab ─────────────────────────────────────────────────────────

async function updateSavedBadge() {
  const { savedJobs = [] } = await chrome.storage.local.get('savedJobs');
  const badge = document.getElementById('savedBadge');
  badge.textContent = savedJobs.length > 0 ? String(savedJobs.length) : '';
}

async function renderSaved() {
  const { savedJobs = [] } = await chrome.storage.local.get('savedJobs');
  const list = document.getElementById('saved-list');
  const empty = document.getElementById('saved-empty');

  if (!savedJobs.length) {
    empty.classList.remove('hidden');
    list.innerHTML = '';
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = savedJobs.map((job, i) => `
    <div class="saved-card" data-idx="${i}">
      <div class="saved-card-header">
        <div>
          <div class="saved-card-title">${esc(job.title || 'Untitled')}</div>
          <div class="saved-card-company">${esc(job.company || '')}${job.company && job.savedAt ? ' · ' : ''}${job.savedAt ? relTime(job.savedAt) : ''}</div>
        </div>
      </div>
      ${(job.keywords || []).length ? `<div class="saved-card-kws">${job.keywords.slice(0,5).map(k=>`<span class="saved-card-kw">${esc(k)}</span>`).join('')}</div>` : ''}
      <div class="saved-card-actions">
        <button class="saved-card-btn saved-btn-opt" data-idx="${i}" data-action="optimize">Optimize Resume</button>
        <button class="saved-card-btn saved-btn-coach" data-idx="${i}" data-action="coach">Prep</button>
        <button class="saved-card-btn saved-btn-del" data-idx="${i}" data-action="delete" title="Remove">✕</button>
      </div>
    </div>
  `).join('');

  // Bind buttons
  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { savedJobs: jobs = [] } = await chrome.storage.local.get('savedJobs');
      const idx = parseInt(btn.dataset.idx);
      const job = jobs[idx];
      if (!job) return;

      if (btn.dataset.action === 'optimize') openPrept('prept_match_v2.html', job);
      if (btn.dataset.action === 'coach')    openPrept('prept_v2.html', job);
      if (btn.dataset.action === 'delete') {
        jobs.splice(idx, 1);
        await chrome.storage.local.set({ savedJobs: jobs });
        renderSaved();
        updateSavedBadge();
      }
    });
  });
}

// ── Listen for messages from background/content ────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'JOB_DETECTED' || msg.type === 'PENDING_JOB_READY') {
    loadCurrentJob();
  }
  if (msg.type === 'JOB_SAVED') {
    updateSavedBadge();
  }
});

// ── Init ───────────────────────────────────────────────────────────────────

loadCurrentJob();
updateSavedBadge();
