// PREPT AI — Job Detection Content Script v2
// Detects job postings, extracts keywords, injects floating action pill.

(function () {
  if (window.__preptAIv2) return;
  window.__preptAIv2 = true;

  const PREPT_URL = 'https://preptai.app';

  // ── Helpers ────────────────────────────────────────────────────────────────

  const $ = (sel, root = document) => root.querySelector(sel);
  const getText = (sel, root) => ($( sel, root)?.innerText || '').trim();
  const getMeta = (n) =>
    (document.querySelector(`meta[property="${n}"]`)?.content ||
     document.querySelector(`meta[name="${n}"]`)?.content || '').trim();

  function truncate(s, n) {
    return s && s.length > n ? s.slice(0, n).trimEnd() + '\u2026' : (s || '');
  }

  function encodeJob(data) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))); }
    catch { return ''; }
  }

  // ── Keyword extraction ─────────────────────────────────────────────────────
  // Extract the most meaningful keywords from the job description.

  const STOP_WORDS = new Set([
    'a','an','the','and','or','but','in','on','at','to','for','of','with',
    'is','are','was','were','be','been','have','has','had','do','does','did',
    'will','would','could','should','may','might','can','this','that','these',
    'those','we','you','our','your','their','they','it','its','from','by',
    'as','if','so','than','then','all','any','some','no','not','also','such',
    'role','position','candidate','team','work','working','experience','years',
    'ability','strong','excellent','good','great','using','use','help','ensure',
    'job','company','opportunity','required','preferred','plus','including',
    'through','about','within','across','between','during','under','over',
    'other','more','new','please','apply','must','well','make','need','based',
    'will be','you will','you are','we are','we have','looking for',
  ]);

  // Patterns that indicate valuable keywords
  const TECH_PATTERN = /\b([A-Z][a-zA-Z0-9+#.-]{1,20}|[a-z]{2,}(?:\.js|\.py|\.go|\.ts)?)\b/g;

  function extractKeywords(description, max = 8) {
    if (!description) return [];

    // Score words by frequency and technical significance
    const words = description.match(/\b[a-zA-Z][a-zA-Z0-9+#.-]{2,}\b/g) || [];
    const freq = {};
    for (const w of words) {
      const k = w.toLowerCase();
      if (STOP_WORDS.has(k) || k.length < 3) continue;
      freq[k] = (freq[k] || 0) + 1;
    }

    // Boost technical/capitalized terms
    const techTerms = description.match(/\b[A-Z][a-zA-Z0-9+#.-]{1,25}\b/g) || [];
    for (const t of techTerms) {
      const k = t.toLowerCase();
      if (!STOP_WORDS.has(k)) freq[k] = (freq[k] || 0) + 2;
    }

    // Look for quoted or bolded phrases as high-signal keywords
    const phrases = description.match(/"([^"]{3,40})"|'([^']{3,40})'/g) || [];
    for (const p of phrases) {
      const k = p.replace(/['"]/g, '').toLowerCase().trim();
      if (k && !STOP_WORDS.has(k)) freq[k] = (freq[k] || 0) + 3;
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
  }

  // ── Site extractors ────────────────────────────────────────────────────────

  const extractors = {
    'linkedin.com'(url) {
      if (!url.includes('/jobs/')) return null;
      return {
        title:
          getText('.job-details-jobs-unified-top-card__job-title h1') ||
          getText('.job-details-jobs-unified-top-card__job-title') ||
          getText('.jobs-unified-top-card__job-title') ||
          getText('h1'),
        company:
          getText('.job-details-jobs-unified-top-card__company-name a') ||
          getText('.job-details-jobs-unified-top-card__company-name') ||
          getText('.topcard__org-name-link'),
        description:
          getText('#job-details') ||
          getText('.jobs-description-content__text') ||
          getText('.jobs-box__html-content'),
      };
    },

    'indeed.com'() {
      return {
        title:
          getText('[data-testid="jobsearch-JobInfoHeader-title"]') ||
          getText('h1[class*="JobInfoHeader"]') ||
          getText('h1'),
        company:
          getText('[data-testid="inlineHeader-companyName"] a') ||
          getText('[data-testid="inlineHeader-companyName"]') ||
          getText('[data-company-name]'),
        description:
          getText('#jobDescriptionText') ||
          getText('[class*="jobDescription"]'),
      };
    },

    'glassdoor.com'() {
      return {
        title:
          getText('[data-test="job-title"]') ||
          getText('[data-test="JobInfoHeader-job-title"]') ||
          getText('h1'),
        company:
          getText('[data-test="employer-name"]') ||
          getText('[data-test="JobInfoHeader-employer-name"]') ||
          getText('[class*="employerName"]'),
        description:
          getText('[data-test="jobDescriptionSection"]') ||
          getText('[data-test="JobDescription"]') ||
          getText('[class*="jobDescriptionContent"]'),
      };
    },

    'lever.co'() {
      const fromTitle = document.title.includes(' - ')
        ? document.title.split(' - ').slice(-1)[0].trim() : '';
      return {
        title: getText('.posting-headline h2') || getText('h2') || getText('h1'),
        company: fromTitle || window.location.hostname.split('.')[0],
        description:
          getText('.posting-requirements') ||
          getText('.posting-description') ||
          getText('[class*="section-wrapper"]'),
      };
    },

    'greenhouse.io'() {
      const fromTitle = document.title.includes(' at ')
        ? document.title.split(' at ').slice(-1)[0].trim() : '';
      return {
        title: getText('#header h1') || getText('.app-title') || getText('h1'),
        company: getText('.company-name') || fromTitle || getMeta('og:site_name'),
        description:
          getText('#content .job-post-description') ||
          getText('#content') ||
          getText('.job-description'),
      };
    },

    'myworkdayjobs.com'() {
      return {
        title:
          getText('[data-automation-id="jobPostingHeader"]') ||
          getText('h2') || getText('h1'),
        company: getMeta('og:site_name') || window.location.hostname.split('.')[0],
        description:
          getText('[data-automation-id="jobPostingDescription"]') ||
          getText('[class*="description"]'),
      };
    },

    'wellfound.com'() {
      const fromTitle = document.title.includes(' at ')
        ? document.title.split(' at ').slice(-1)[0].trim() : '';
      return {
        title: getText('h1') || getText('[class*="heading"]'),
        company: getText('[data-test="company-name"]') || fromTitle,
        description: getText('[class*="description"]') || getText('[class*="jobDescription"]'),
      };
    },

    'bamboohr.com'() {
      return {
        title: getText('[class*="BambooRich"] h2') || getText('h2') || getText('h1'),
        company: getMeta('og:site_name') || window.location.hostname.split('.')[0],
        description: getText('#BambooRich-description') || getText('[class*="BambooRich"]'),
      };
    },

    'ashbyhq.com'() {
      const fromTitle = document.title.includes(' at ')
        ? document.title.split(' at ').slice(-1)[0].trim() : '';
      return {
        title: getText('h1') || getText('[class*="title"]'),
        company: getText('[class*="companyName"]') || fromTitle,
        description:
          getText('[class*="jobPostingDescription"]') ||
          getText('[class*="rightColumn"]') ||
          getText('[class*="description"]'),
      };
    },

    'smartrecruiters.com'() {
      const fromTitle = document.title.includes(' at ')
        ? document.title.split(' at ').slice(-1)[0].trim() : '';
      return {
        title: getText('.job-title') || getText('h1'),
        company: getText('.hiring-company-link') || getText('.company-name') || fromTitle,
        description: getText('.job-sections') || getText('[class*="jobDescription"]'),
      };
    },

    'jobvite.com'() {
      return {
        title: getText('h1.jv-header') || getText('h1'),
        company: getMeta('og:site_name') || document.title.split('|').pop().trim(),
        description: getText('#job-description') || getText('.jv-description'),
      };
    },

    'icims.com'() {
      return {
        title: getText('.iCIMS_Header h1') || getText('h1'),
        company: getMeta('og:site_name') || window.location.hostname.split('.')[0],
        description: getText('.iCIMS_JobContent') || getText('[class*="job-description"]'),
      };
    },

    'recruitee.com'() {
      return {
        title: getText('.job-title') || getText('h1'),
        company: getMeta('og:site_name') || window.location.hostname.split('.')[0],
        description: getText('.description') || getText('[class*="job-content"]'),
      };
    },

    'teamtailor.com'() {
      return {
        title: getText('h1.title') || getText('h1'),
        company: getMeta('og:site_name') || document.title.split(' - ').pop().trim(),
        description: getText('[class*="job-description"]') || getText('[class*="content"]'),
      };
    },
  };

  // ── Generic job detection (fallback for unlisted sites) ────────────────────
  // Uses signal scoring to decide if the current page looks like a job posting.

  function genericExtract() {
    const text = document.body?.innerText || '';
    const lower = text.toLowerCase();

    // Score signals
    let score = 0;
    const signals = [
      [/\b(responsibilities|requirements|qualifications|about the role|what you.ll do)\b/i, 4],
      [/\b(years of experience|years experience)\b/i, 3],
      [/\b(apply now|apply for this (job|position|role))\b/i, 3],
      [/\b(salary|compensation|equity|benefits|pto|401k)\b/i, 2],
      [/\b(full.?time|part.?time|remote|hybrid|on.?site)\b/i, 2],
      [/\b(engineering|marketing|design|sales|finance|operations|product|data)\b/i, 1],
    ];
    for (const [re, w] of signals) {
      if (re.test(lower)) score += w;
    }

    if (score < 6) return null;   // not confident enough

    const h1 = getText('h1');
    const title = h1 || getText('h2') || document.title.split(/[-|]/).shift().trim();
    const company =
      getMeta('og:site_name') ||
      document.querySelector('[itemprop="hiringOrganization"] [itemprop="name"]')?.innerText?.trim() ||
      '';
    const description = text.slice(0, 10000);

    return { title, company, description, generic: true };
  }

  function getExtractor() {
    const host = window.location.hostname;
    for (const [key, fn] of Object.entries(extractors)) {
      if (host.includes(key)) return () => fn(window.location.href);
    }
    return null;
  }

  function isValidJob(d) {
    return d && d.title?.length > 2 && d.description?.length > 100;
  }

  // ── Floating pill UI ───────────────────────────────────────────────────────

  function injectPill(jobData) {
    if (document.getElementById('prept-ai-pill')) return;

    const encoded = encodeJob(jobData);
    if (!encoded) return;

    const keywords = extractKeywords(jobData.description, 6);
    const kwHtml = keywords.length
      ? `<div class="prept-keywords">${keywords.map(k => `<span class="prept-kw">${k}</span>`).join('')}</div>`
      : '';

    const pill = document.createElement('div');
    pill.id = 'prept-ai-pill';
    pill.setAttribute('role', 'complementary');

    pill.innerHTML = `
      <button id="prept-trigger" aria-label="Open PREPT AI" title="PREPT AI detected a job posting">
        <span class="prept-logo-p">P</span>
        <span class="prept-trigger-label">PREPT</span>
      </button>
      <div id="prept-card" role="dialog" aria-hidden="true">
        <div class="prept-card-header">
          <div class="prept-brand">PREPT <span>AI</span></div>
          <div class="prept-header-actions">
            <button id="prept-save-btn" class="prept-save-btn" aria-label="Save this job" title="Save job">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
            <button id="prept-close" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="prept-job-info">
          <div class="prept-job-title">${truncate(jobData.title, 65)}</div>
          <div class="prept-job-company">${truncate(jobData.company, 55)}</div>
        </div>
        ${kwHtml}
        <div class="prept-divider"></div>
        <div class="prept-actions">
          <button class="prept-btn prept-btn-primary" id="prept-optimize">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Optimize My Resume
          </button>
          <button class="prept-btn prept-btn-secondary" id="prept-coach">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Prep for Interview
          </button>
        </div>
        <div class="prept-quick-links">
          <button class="prept-ql" id="prept-coverletter" title="Generate cover letter">
            ✉ Cover Letter
          </button>
          <button class="prept-ql" id="prept-skillsgap" title="Skills gap analysis">
            🎯 Skills Gap
          </button>
          <button class="prept-ql" id="prept-sidepanel" title="Open full side panel">
            ⚡ Side Panel
          </button>
        </div>
        <div class="prept-footer-note">preptai.app</div>
      </div>
    `;

    document.body.appendChild(pill);

    // ── Event handlers ─────────────────────────────────────────────────────

    const trigger = document.getElementById('prept-trigger');
    const card    = document.getElementById('prept-card');

    function openCard()  { pill.classList.add('open');    card.setAttribute('aria-hidden', 'false'); }
    function closeCard() { pill.classList.remove('open'); card.setAttribute('aria-hidden', 'true'); }

    trigger.addEventListener('click', () =>
      pill.classList.contains('open') ? closeCard() : openCard()
    );
    document.getElementById('prept-close').addEventListener('click', closeCard);

    // Main actions
    document.getElementById('prept-optimize').addEventListener('click', () => {
      window.open(`${PREPT_URL}/prept_match_v2.html#prept=${encoded}`, '_blank');
      closeCard();
    });
    document.getElementById('prept-coach').addEventListener('click', () => {
      window.open(`${PREPT_URL}/prept_v2.html#prept=${encoded}`, '_blank');
      closeCard();
    });

    // Quick links
    document.getElementById('prept-coverletter').addEventListener('click', () => {
      window.open(`${PREPT_URL}/prept_match_v2.html#prept=${encoded}&tool=coverletter`, '_blank');
      closeCard();
    });
    document.getElementById('prept-skillsgap').addEventListener('click', () => {
      window.open(`${PREPT_URL}/prept_match_v2.html#prept=${encoded}&tool=skillsgap`, '_blank');
      closeCard();
    });
    document.getElementById('prept-sidepanel').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
      closeCard();
    });

    // Save job
    const saveBtn = document.getElementById('prept-save-btn');
    loadSavedState(jobData.title + '|' + jobData.company, saveBtn);
    saveBtn.addEventListener('click', () => toggleSaveJob(jobData, saveBtn));

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!pill.contains(e.target)) closeCard();
    });

    // Store job for side panel / popup
    storeDetectedJob(jobData);
    chrome.runtime.sendMessage({ type: 'JOB_DETECTED' }).catch(() => {});
  }

  // ── Job saving ─────────────────────────────────────────────────────────────

  function jobKey(job) {
    return (job.title + '|' + job.company).toLowerCase().trim();
  }

  async function loadSavedState(key, btn) {
    const { savedJobs = [] } = await chrome.storage.local.get('savedJobs');
    const saved = savedJobs.some(j => jobKey(j) === key.toLowerCase());
    btn.classList.toggle('saved', saved);
    btn.title = saved ? 'Saved! Click to unsave' : 'Save this job';
  }

  async function toggleSaveJob(jobData, btn) {
    const key = jobKey(jobData);
    const { savedJobs = [] } = await chrome.storage.local.get('savedJobs');
    const idx = savedJobs.findIndex(j => jobKey(j) === key);

    if (idx >= 0) {
      savedJobs.splice(idx, 1);
      btn.classList.remove('saved');
      btn.title = 'Save this job';
    } else {
      savedJobs.unshift({
        ...jobData,
        savedAt: Date.now(),
        url: window.location.href,
        keywords: extractKeywords(jobData.description, 8),
      });
      btn.classList.add('saved');
      btn.title = 'Saved! Click to unsave';
      showPillToast('Job saved!');
    }

    await chrome.storage.local.set({ savedJobs: savedJobs.slice(0, 100) });
    chrome.runtime.sendMessage({ type: 'JOB_SAVED' }).catch(() => {});
  }

  function showPillToast(msg) {
    const existing = document.getElementById('prept-pill-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.id = 'prept-pill-toast';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:80px;right:24px;z-index:2147483647;background:#45de7a;color:#06060d;padding:8px 14px;border-radius:8px;font-family:system-ui,sans-serif;font-size:13px;font-weight:700;pointer-events:none;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  async function storeDetectedJob(jobData) {
    try {
      await chrome.storage.session.set({
        detectedJob: {
          ...jobData,
          keywords: extractKeywords(jobData.description, 8),
        },
        detectedAt: Date.now(),
        detectedUrl: window.location.href,
      });
    } catch {}
  }

  // ── Main detection ─────────────────────────────────────────────────────────

  let pillInjected = false;

  function tryDetect() {
    if (pillInjected) return;

    const extractor = getExtractor();
    let data = extractor ? extractor() : null;

    // Fallback to generic detection if no site extractor matched or returned nothing
    if (!isValidJob(data)) {
      data = genericExtract();
    }

    if (isValidJob(data)) {
      pillInjected = true;
      injectPill(data);
    }
  }

  tryDetect();

  let attempts = 0;
  const retryTimer = setInterval(() => {
    if (pillInjected || ++attempts > 10) { clearInterval(retryTimer); return; }
    tryDetect();
  }, 700);

  // SPA navigation watcher (LinkedIn, etc.)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      pillInjected = false;
      attempts = 0;
      document.getElementById('prept-ai-pill')?.remove();
      chrome.runtime.sendMessage({ type: 'JOB_CLEARED' }).catch(() => {});
      setTimeout(tryDetect, 1200);
    }
  }).observe(document.documentElement, { subtree: true, childList: true });
})();
