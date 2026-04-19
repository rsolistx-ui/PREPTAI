// PREPT AI Side Panel

const PREPT_URL = 'https://preptai.co';

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

// ── Easy Apply Helper ──────────────────────────────────────────────────────

async function loadEAContact() {
  const { eaContact } = await chrome.storage.local.get('eaContact');
  const display = document.getElementById('eaContactDisplay');
  const setupBtn = document.getElementById('eaSetupBtn');
  if (!display) return;

  if (eaContact && Object.values(eaContact).some(Boolean)) {
    setupBtn.style.display = 'none';
    display.style.display = 'block';
    const fields = [
      { label: 'Name',     val: eaContact.name },
      { label: 'Email',    val: eaContact.email },
      { label: 'Phone',    val: eaContact.phone },
      { label: 'Location', val: eaContact.location },
      { label: 'LinkedIn', val: eaContact.linkedin },
    ].filter(f => f.val);
    display.innerHTML = `
      <div style="margin-bottom:8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:rgba(255,255,255,0.4)">Your info — click to copy</div>
      ${fields.map(f => `
        <div class="ea-field">
          <span class="ea-field-label">${f.label}</span>
          <span class="ea-field-val" title="${esc(f.val)}">${esc(f.val)}</span>
          <button class="ea-copy-btn" data-val="${esc(f.val)}" onclick="eaCopy(this)">Copy</button>
        </div>`).join('')}
      <button onclick="showEAForm(true)" style="margin-top:9px;width:100%;padding:6px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.4);font-family:inherit;font-size:11px;cursor:pointer">✏ Edit info</button>`;
  } else {
    setupBtn.style.display = 'block';
    display.style.display = 'none';
  }
}

function showEAForm(prefill) {
  const form = document.getElementById('eaContactForm');
  const setupBtn = document.getElementById('eaSetupBtn');
  if (!form) return;
  setupBtn.style.display = 'none';
  form.style.display = 'flex';
  if (prefill) {
    chrome.storage.local.get('eaContact').then(({ eaContact }) => {
      if (!eaContact) return;
      ['name','email','phone','location','linkedin'].forEach(k => {
        const el = document.getElementById('ea-' + k);
        if (el && eaContact[k]) el.value = eaContact[k];
      });
    });
  }
}

function cancelEAEdit() {
  document.getElementById('eaContactForm').style.display = 'none';
  loadEAContact();
}

async function saveEAContact() {
  const contact = {
    name:     document.getElementById('ea-name')?.value?.trim() || '',
    email:    document.getElementById('ea-email')?.value?.trim() || '',
    phone:    document.getElementById('ea-phone')?.value?.trim() || '',
    location: document.getElementById('ea-location')?.value?.trim() || '',
    linkedin: document.getElementById('ea-linkedin')?.value?.trim() || '',
  };
  await chrome.storage.local.set({ eaContact: contact });
  document.getElementById('eaContactForm').style.display = 'none';
  loadEAContact();
}

function eaCopy(btn) {
  const val = btn.dataset.val || '';
  navigator.clipboard.writeText(val).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = orig; }, 1400);
  }).catch(() => {});
}

// ── Init ───────────────────────────────────────────────────────────────────

loadCurrentJob();
updateSavedBadge();
loadEAContact();
