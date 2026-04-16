// PREPT AI — Job Detection Content Script
// Detects job postings across major job sites and injects a floating action pill.

(function () {
  if (window.__preptAIInjected) return;
  window.__preptAIInjected = true;

  const PREPT_URL = 'https://preptai.app';

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function getText(selector) {
    return (document.querySelector(selector)?.innerText || '').trim();
  }

  function getMeta(name) {
    return (
      document.querySelector(`meta[property="${name}"]`)?.content ||
      document.querySelector(`meta[name="${name}"]`)?.content ||
      ''
    ).trim();
  }

  function encodeJob(data) {
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    } catch {
      return '';
    }
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len).trimEnd() + '…' : str;
  }

  // ─── Site Extractors ────────────────────────────────────────────────────────

  const extractors = {
    'linkedin.com'(url) {
      if (!url.includes('/jobs/')) return null;
      const title =
        getText('.job-details-jobs-unified-top-card__job-title h1') ||
        getText('.job-details-jobs-unified-top-card__job-title') ||
        getText('.jobs-unified-top-card__job-title') ||
        getText('h1');
      const company =
        getText('.job-details-jobs-unified-top-card__company-name a') ||
        getText('.job-details-jobs-unified-top-card__company-name') ||
        getText('.topcard__org-name-link');
      const description =
        getText('#job-details') ||
        getText('.jobs-description-content__text') ||
        getText('.jobs-box__html-content');
      return { title, company, description };
    },

    'indeed.com'() {
      const title =
        getText('[data-testid="jobsearch-JobInfoHeader-title"]') ||
        getText('h1[class*="JobInfoHeader"]') ||
        getText('h1');
      const company =
        getText('[data-testid="inlineHeader-companyName"] a') ||
        getText('[data-testid="inlineHeader-companyName"]') ||
        getText('[data-company-name]') ||
        getText('.jobsearch-CompanyInfoContainer');
      const description = getText('#jobDescriptionText') || getText('[class*="jobDescription"]');
      return { title, company, description };
    },

    'glassdoor.com'() {
      const title =
        getText('[data-test="job-title"]') ||
        getText('[data-test="JobInfoHeader-job-title"]') ||
        getText('h1');
      const company =
        getText('[data-test="employer-name"]') ||
        getText('[data-test="JobInfoHeader-employer-name"]') ||
        getText('[class*="employerName"]');
      const description =
        getText('[data-test="jobDescriptionSection"]') ||
        getText('[data-test="JobDescription"]') ||
        getText('[class*="jobDescriptionContent"]');
      return { title, company, description };
    },

    'lever.co'() {
      const title = getText('.posting-headline h2') || getText('h2') || getText('h1');
      const company =
        document.title.includes(' - ')
          ? document.title.split(' - ').pop().trim()
          : window.location.hostname.split('.')[0];
      const description =
        getText('.posting-requirements .section-wrapper') ||
        getText('.posting-description') ||
        getText('[class*="section-wrapper"]');
      return { title, company, description };
    },

    'greenhouse.io'() {
      const title = getText('#header h1') || getText('.app-title') || getText('h1');
      const company =
        getText('.company-name') ||
        (document.title.includes(' at ') ? document.title.split(' at ').pop().trim() : '') ||
        getMeta('og:site_name');
      const description =
        getText('#content .job-post-description') ||
        getText('#content') ||
        getText('.job-description');
      return { title, company, description };
    },

    'myworkdayjobs.com'() {
      const title =
        getText('[data-automation-id="jobPostingHeader"]') ||
        getText('h2') ||
        getText('h1');
      const company =
        getMeta('og:site_name') ||
        window.location.hostname.split('.')[0];
      const description =
        getText('[data-automation-id="jobPostingDescription"]') ||
        getText('[class*="description"]');
      return { title, company, description };
    },

    'wellfound.com'() {
      const title = getText('h1') || getText('[class*="heading"]');
      const company =
        getText('[data-test="company-name"]') ||
        getText('[class*="startupName"]') ||
        (document.title.includes(' at ') ? document.title.split(' at ').pop().trim() : '');
      const description = getText('[class*="description"]') || getText('[class*="jobDescription"]');
      return { title, company, description };
    },

    'bamboohr.com'() {
      const title =
        getText('[class*="BambooRich"] h2') ||
        getText('h2') ||
        getText('h1');
      const company =
        getMeta('og:site_name') ||
        window.location.hostname.replace('app.', '').split('.')[0];
      const description = getText('#BambooRich-description') || getText('[class*="BambooRich"]');
      return { title, company, description };
    },

    'ashbyhq.com'() {
      const title = getText('h1') || getText('[class*="title"]');
      const company =
        getText('[class*="companyName"]') ||
        (document.title.includes(' at ') ? document.title.split(' at ').pop().trim() : '');
      const description =
        getText('[class*="jobPostingDescription"]') ||
        getText('[class*="rightColumn"]') ||
        getText('[class*="description"]');
      return { title, company, description };
    },

    'smartrecruiters.com'() {
      const title = getText('.job-title') || getText('h1');
      const company =
        getText('.hiring-company-link') ||
        getText('.company-name') ||
        (document.title.includes(' at ') ? document.title.split(' at ').pop().trim() : '');
      const description =
        getText('.job-sections') ||
        getText('[class*="jobDescription"]');
      return { title, company, description };
    },

    'jobvite.com'() {
      const title = getText('h1.jv-header') || getText('h1');
      const company = getMeta('og:site_name') || document.title.split('|').pop().trim();
      const description = getText('#job-description') || getText('.jv-description');
      return { title, company, description };
    },

    'icims.com'() {
      const title = getText('.iCIMS_Header h1') || getText('h1');
      const company = getMeta('og:site_name') || window.location.hostname.split('.')[0];
      const description = getText('.iCIMS_JobContent') || getText('[class*="job-description"]');
      return { title, company, description };
    },
  };

  function getExtractor() {
    const host = window.location.hostname;
    for (const [key, fn] of Object.entries(extractors)) {
      if (host.includes(key)) return () => fn(window.location.href);
    }
    return null;
  }

  function isValidJob(d) {
    return d && d.title && d.title.length > 2 && d.description && d.description.length > 80;
  }

  // ─── Floating Pill UI ───────────────────────────────────────────────────────

  function injectPill(jobData) {
    if (document.getElementById('prept-ai-pill')) return;

    const encoded = encodeJob(jobData);
    if (!encoded) return;

    const pill = document.createElement('div');
    pill.id = 'prept-ai-pill';
    pill.setAttribute('role', 'complementary');
    pill.setAttribute('aria-label', 'PREPT AI job copilot');

    pill.innerHTML = `
      <button id="prept-trigger" aria-label="Open PREPT AI" title="PREPT AI detected a job posting">
        <span class="prept-logo-p">P</span>
        <span class="prept-trigger-label">PREPT</span>
      </button>
      <div id="prept-card" role="dialog" aria-hidden="true">
        <div class="prept-card-header">
          <div class="prept-brand">PREPT <span>AI</span></div>
          <button id="prept-close" aria-label="Close PREPT AI">&times;</button>
        </div>
        <div class="prept-job-info">
          <div class="prept-job-title">${truncate(jobData.title, 60)}</div>
          <div class="prept-job-company">${truncate(jobData.company, 50)}</div>
        </div>
        <div class="prept-divider"></div>
        <div class="prept-actions">
          <button class="prept-btn prept-btn-primary" id="prept-optimize" data-encoded="${encoded}" data-page="match">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Optimize My Resume
          </button>
          <button class="prept-btn prept-btn-secondary" id="prept-coach" data-encoded="${encoded}" data-page="coach">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Prep for Interview
          </button>
        </div>
        <div class="prept-footer-note">preptai.app</div>
      </div>
    `;

    document.body.appendChild(pill);

    const trigger = document.getElementById('prept-trigger');
    const card = document.getElementById('prept-card');
    const closeBtn = document.getElementById('prept-close');

    function openCard() {
      pill.classList.add('open');
      card.setAttribute('aria-hidden', 'false');
    }
    function closeCard() {
      pill.classList.remove('open');
      card.setAttribute('aria-hidden', 'true');
    }

    trigger.addEventListener('click', () =>
      pill.classList.contains('open') ? closeCard() : openCard()
    );
    closeBtn.addEventListener('click', closeCard);

    document.getElementById('prept-optimize').addEventListener('click', () => {
      window.open(`${PREPT_URL}/prept_match_v2.html#prept=${encoded}`, '_blank');
      closeCard();
    });

    document.getElementById('prept-coach').addEventListener('click', () => {
      window.open(`${PREPT_URL}/prept_v2.html#prept=${encoded}`, '_blank');
      closeCard();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!pill.contains(e.target)) closeCard();
    });

    // Store for popup access
    try {
      chrome.storage.session.set({
        detectedJob: jobData,
        detectedAt: Date.now(),
        detectedUrl: window.location.href,
      });
    } catch {}

    // Notify background to update badge
    try {
      chrome.runtime.sendMessage({ type: 'JOB_DETECTED' });
    } catch {}
  }

  // ─── Main Detection Loop ────────────────────────────────────────────────────

  let injected = false;

  function tryDetect() {
    if (injected) return;
    const extractor = getExtractor();
    if (!extractor) return;

    const data = extractor();
    if (isValidJob(data)) {
      injected = true;
      injectPill(data);
    }
  }

  // Initial attempt
  tryDetect();

  // Retry for SPAs that render content after initial load
  let attempts = 0;
  const retryTimer = setInterval(() => {
    if (injected || ++attempts > 8) {
      clearInterval(retryTimer);
      return;
    }
    tryDetect();
  }, 800);

  // Watch for SPA navigation (LinkedIn, etc.)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      injected = false;
      attempts = 0;
      const old = document.getElementById('prept-ai-pill');
      if (old) old.remove();
      setTimeout(tryDetect, 1200);
    }
  }).observe(document.documentElement, { subtree: true, childList: true });
})();
