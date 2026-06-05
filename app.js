'use strict';

// ─────────────────────────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────────────────────────
const CONFIG = {
  BACKEND_URL:   'https://curio-backend-yxm1.onrender.com',
  CARDS_TO_SHOW: 80,
};

// ─────────────────────────────────────────────────────────────────
//  CARD CACHE  —  persists card data across shuffles so bookmarks
//  always work even after the feed reloads with new content
// ─────────────────────────────────────────────────────────────────
const cardCache = new Map();

// ─────────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────────
const state = {
  theme:       localStorage.getItem('curio_theme') || 'dark',
  tab:         'discover',
  activeTopic: 'all',
  activeLang:  'all',
  allCards:    [], // full unfiltered set
  cards:       [],
  savedIds:    JSON.parse(localStorage.getItem('curio_saved_ids')   || '[]'),
  savedCards:  JSON.parse(localStorage.getItem('curio_saved_cards') || '[]'),
};

// ─────────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────
//  API
// ─────────────────────────────────────────────────────────────────
async function apiFetch(path) {
  const r = await fetch(CONFIG.BACKEND_URL + path, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('Backend ' + r.status + ': ' + path);
  return r.json();
}

// Fetch full set: English mix + dedicated FR + dedicated AR
// This guarantees language filter always has enough content
async function loadContent() {
  const [main, fr, ar] = await Promise.allSettled([
    apiFetch('/api/feed?category=all&lang=all&limit=60'),
    apiFetch('/api/feed?category=all&lang=fr&limit=20'),
    apiFetch('/api/feed?category=all&lang=ar&limit=20'),
  ]);
  const all = [
    ...(main.status === 'fulfilled' ? main.value.items || [] : []),
    ...(fr.status   === 'fulfilled' ? fr.value.items   || [] : []),
    ...(ar.status   === 'fulfilled' ? ar.value.items   || [] : []),
  ];
  const seen = new Set();
  state.allCards = all.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
  state.cards = state.allCards;
  state.allCards.forEach(c => cardCache.set(c.id, c));
  // Persist cards for the session — so page reloads never show a blank feed
  // or fetch uninvited. Content only changes when the user pulls down.
  try { sessionStorage.setItem('curio_cards', JSON.stringify(state.allCards)); } catch {}
}

// ─────────────────────────────────────────────────────────────────
//  CARD RENDERING
// ─────────────────────────────────────────────────────────────────
// Source domain → language map (fallback when backend lang field is missing)
const SOURCE_LANG = {
  'monde-diplomatique.fr':'fr','ifri.org':'fr','orientxxi.info':'fr',
  'slate.fr':'fr','aoc.media':'fr','scienceshumaines.com':'fr',
  'courrierinternational.com':'fr','esprit.presse.fr':'fr',
  'alternatives-economiques.fr':'fr','cnrs.fr':'fr','inserm.fr':'fr',
  'inrae.fr':'fr','laviedesidees.fr':'fr','contretemps.eu':'fr',
  'raseef22.net':'ar','madamasr.com':'ar','daraj.com':'ar',
  'arab-reform.net':'ar','assafirarabi.com':'ar','aljumhuriya.net':'ar',
  'jadaliyya.com':'ar','7iber.com':'ar','madarcenter.org':'ar',
};
function cardLang(card) {
  if (card.lang && card.lang !== 'en') return card.lang;
  const src = card.source || '';
  for (const [domain, lang] of Object.entries(SOURCE_LANG)) {
    if (src.includes(domain)) return lang;
  }
  return 'en';
}

const TOPIC_ICONS = {
  'life-sciences-pharma': '🧬',
  'medicine':          '🩺',
  'ai-tech':           '🤖',
  'physical-sciences': '⚗️',
  'space':             '🔭',
  'earth':             '🌍',
  'society-economics': '🌐',
  'history':           '🏛',
  'arts-culture':      '🎨',
  'general':           '📖',
};

function tagClass(topic) {
  return 'topic-tag tag-' + (topic || 'general');
}

function tagLabel(topic) {
  const labels = {
    'life-sciences-pharma': 'Life Sciences & Pharma',
    'medicine':          'Medicine',
    'ai-tech':           'AI & Tech',
    'physical-sciences': 'Physical Sciences',
    'space':             'Space',
    'earth':             'Earth',
    'society-economics': 'Society & Economics',
    'history':           'History',
    'arts-culture':      'Arts & Culture',
    'general':           'General',
  };
  return labels[topic] || (topic ? topic.charAt(0).toUpperCase() + topic.slice(1) : 'General');
}

function cardImageHtml(card) {
  const icon = TOPIC_ICONS[card.topic] || '📖';
  return `
    <div class="card-img-wrap">
      <img
        src="${(card.image || '').replace(/"/g, '&quot;')}"
        alt="${(card.title || '').replace(/"/g, '&quot;')}"
        loading="lazy"
        onload="this.classList.remove('loading')"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
        class="loading"
      >
      <div class="img-fallback" style="display:none">${icon}</div>
      <span class="${tagClass(card.topic)} topic-badge-img">${tagLabel(card.topic)}</span>
    </div>`;
}

function cardActionsHtml(card) {
  const saved = state.savedIds.includes(card.id);
  const safeUrl = encodeURIComponent(card.url || '');
  return `
    <div class="card-actions">
      <button class="save-btn ${saved ? 'saved' : ''}"
              onclick="toggleSave('${card.id}', this)"
              aria-label="${saved ? 'Unsave' : 'Save'}">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <button class="copy-btn"
              onclick="copyLink('${safeUrl}', this)"
              aria-label="Copy link">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        Copy link
      </button>
    </div>`;
}

function buildCard(card, isOtd) {
  const el = document.createElement('article');
  el.className = 'card' + (isOtd ? ' card-otd' : '') + (cardLang(card) === 'ar' ? ' card-rtl' : '');
  el.dataset.id   = card.id;
  el.dataset.lang = cardLang(card);
  el.innerHTML = `
    ${cardImageHtml(card)}
    <div class="card-body">
      <div class="card-meta">
        <span class="source-label">
          ${(card.sourceLabel || card.source || '')}
          ${card.verified ? '<span class="verified-check"><svg viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 4.5-4.5"/></svg></span>' : ''}
        </span>
        <span class="read-time">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${card.readTime || '3 min'}
        </span>
      </div>
      <a class="card-title-link" href="${card.url || '#'}" target="_blank" rel="noopener noreferrer">
        <h2 class="card-title">${card.title || ''}</h2>
      </a>
      <p class="card-excerpt">${card.excerpt || ''}</p>
      ${cardActionsHtml(card)}
    </div>`;
  return el;
}

// ─────────────────────────────────────────────────────────────────
//  RENDER DISCOVER
// ─────────────────────────────────────────────────────────────────
function renderDiscover() {
  const container = document.getElementById('discover-cards');
  container.innerHTML = '';

  // Filter locally from full card set — no API call needed
  let cards = state.allCards.length ? state.allCards : state.cards;

  if (state.activeTopic !== 'all') {
    cards = cards.filter(c => c.topic === state.activeTopic);
  }
  if (state.activeLang !== 'all') {
    cards = cards.filter(c => cardLang(c) === state.activeLang);
  }

  if (!cards.length) {
    const langMsg = state.activeLang !== 'all' ? ' in this language' : '';
    const topicMsg = state.activeTopic !== 'all' ? ' in this category' : '';
    container.innerHTML = `<p class="empty-state">No articles found${topicMsg}${langMsg}. Pull down to refresh.</p>`;
    return;
  }

  cards.forEach(card => container.appendChild(buildCard(card, false)));
}

// ─────────────────────────────────────────────────────────────────
//  RENDER SAVED
// ─────────────────────────────────────────────────────────────────
function renderSaved() {
  const container = document.getElementById('saved-list');
  const empty     = document.getElementById('saved-empty');
  container.innerHTML = '';

  if (!state.savedCards.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  state.savedCards.forEach(card => {
    const el = document.createElement('div');
    el.className = 'saved-item';
    el.innerHTML = `
      <div class="saved-thumb">
        <img src="${card.image || ''}" alt="" loading="lazy" onerror="this.src=''">
      </div>
      <div class="saved-body">
        <div class="saved-title">${card.title || ''}</div>
        <div class="saved-meta">${card.sourceLabel || card.source || ''} · ${tagLabel(card.topic)} · ${card.readTime || '3 min'}</div>
      </div>
      <button class="saved-del" onclick="removeSaved('${card.id}')" aria-label="Remove">✕</button>`;
    el.querySelector('.saved-thumb').onclick = () => window.open(card.url, '_blank');
    el.querySelector('.saved-body').onclick  = () => window.open(card.url, '_blank');
    container.appendChild(el);
  });
}

// ─────────────────────────────────────────────────────────────────
//  INTERACTIONS
// ─────────────────────────────────────────────────────────────────

// Fixed bookmark: looks up card from cardCache (persists across shuffles)
function toggleSave(id, btn) {
  // Find card — first in cardCache (survives shuffles), then current state
  let card = cardCache.get(id);
  if (!card) card = state.cards.find(c => c.id === id);
  if (!card) return;

  const isSaved = state.savedIds.includes(id);

  if (isSaved) {
    state.savedIds   = state.savedIds.filter(x => x !== id);
    state.savedCards = state.savedCards.filter(c => c.id !== id);
  } else {
    state.savedIds.push(id);
    state.savedCards.push(card);
  }

  // Update all bookmark buttons for this card across the rendered feed
  document.querySelectorAll('[data-id="' + id + '"] .save-btn').forEach(b => {
    b.classList.toggle('saved', !isSaved);
    b.setAttribute('aria-label', !isSaved ? 'Unsave' : 'Save');
  });
  // Also update the clicked button directly (in case data-id lookup missed it)
  if (btn) {
    btn.classList.toggle('saved', !isSaved);
  }

  localStorage.setItem('curio_saved_ids',   JSON.stringify(state.savedIds));
  localStorage.setItem('curio_saved_cards', JSON.stringify(state.savedCards));
}

function removeSaved(id) {
  state.savedIds   = state.savedIds.filter(x => x !== id);
  state.savedCards = state.savedCards.filter(c => c.id !== id);
  localStorage.setItem('curio_saved_ids',   JSON.stringify(state.savedIds));
  localStorage.setItem('curio_saved_cards', JSON.stringify(state.savedCards));
  renderSaved();
}

function copyLink(encodedUrl, btn) {
  const url = decodeURIComponent(encodedUrl);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      btn.classList.add('copied');
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1800);
    }).catch(() => window.open(url, '_blank'));
  } else {
    window.open(url, '_blank');
  }
}

// ─────────────────────────────────────────────────────────────────
//  NAVIGATION & FILTER
// ─────────────────────────────────────────────────────────────────
let savedDiscoverScroll = 0;

function setTab(tab) {
  const feed = document.getElementById('feed');

  // Save scroll position when leaving discover
  if (state.tab === 'discover') savedDiscoverScroll = feed.scrollTop;

  state.tab = tab;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));

  document.getElementById('feed-discover').style.display = tab === 'discover' ? 'block' : 'none';
  document.getElementById('feed-saved').style.display    = tab === 'saved'    ? 'block' : 'none';
  document.getElementById('filter-wrap').style.display   = tab === 'discover' ? 'block' : 'none';

  if (tab === 'saved') {
    feed.scrollTop = 0;
    renderSaved();
  }

  // Restore discover scroll position when returning
  if (tab === 'discover') {
    requestAnimationFrame(() => { feed.scrollTop = savedDiscoverScroll; });
  }
}

function setTopic(topic) {
  state.activeTopic = topic;
  document.querySelectorAll('[data-topic]').forEach(p => p.classList.toggle('active', p.dataset.topic === topic));
  const btn = document.getElementById('filter-btn');
  if (btn) btn.classList.toggle('active', topic !== 'all');
  document.getElementById('filter-dropdown').classList.remove('open');
  // Filter locally — no new API call
  if (state.tab === 'discover') renderDiscover();
}

function toggleFilterDropdown() {
  document.getElementById('filter-dropdown').classList.toggle('open');
}

// ─────────────────────────────────────────────────────────────────
//  SHUFFLE
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
//  PULL TO REFRESH
// ─────────────────────────────────────────────────────────────────
const REFRESH_COOLDOWN_MS = 1 * 60 * 1000; // 1 minute
let lastRefreshTime = 0;

function timeUntilRefresh() {
  const ms   = REFRESH_COOLDOWN_MS - (Date.now() - lastRefreshTime);
  if (ms <= 0) return null;
  return 'New curiosities may be refreshed once a minute';
}

function showPTRMessage(msg, duration = 2200) {
  const ptr = document.getElementById('ptr-indicator');
  ptr.style.height  = '48px';
  ptr.style.opacity = '1';
  ptr.classList.add('message');
  ptr.querySelector('.ptr-label').textContent = msg;
  setTimeout(() => {
    ptr.style.height  = '0';
    ptr.style.opacity = '0';
    ptr.classList.remove('message');
    ptr.querySelector('.ptr-label').textContent = '';
  }, duration);
}

function setupPullToRefresh() {
  const feed      = document.getElementById('feed');
  const ptr       = document.getElementById('ptr-indicator');
  let startY      = 0;
  let pulling     = false;
  let triggered   = false;
  const THRESHOLD = 72;

  feed.addEventListener('touchstart', e => {
    if (feed.scrollTop === 0 && state.tab === 'discover') {
      startY    = e.touches[0].clientY;
      pulling   = true;
      triggered = false;
    }
  }, { passive: true });

  feed.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dist    = e.touches[0].clientY - startY;
    if (dist <= 0) { pulling = false; ptr.style.height = '0'; ptr.style.opacity = '0'; return; }
    const clamped = Math.min(dist * 0.45, THRESHOLD + 16);
    ptr.style.height  = clamped + 'px';
    ptr.style.opacity = Math.min(clamped / THRESHOLD, 1);
    // Rotate arrow as user pulls — 0° at start, 180° at threshold
    const rotation = Math.min((clamped / THRESHOLD) * 180, 180);
    const arrow = ptr.querySelector('.ptr-arrow');
    if (arrow) arrow.style.transform = `rotate(${rotation}deg)`;
    if (clamped >= THRESHOLD && !triggered) { triggered = true;  ptr.classList.add('ready'); }
    else if (clamped < THRESHOLD)           { triggered = false; ptr.classList.remove('ready'); }
  }, { passive: true });

  feed.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    ptr.classList.remove('ready');
    const arrow = ptr.querySelector('.ptr-arrow');
    if (arrow) arrow.style.transform = '';

    if (triggered) {
      const wait = timeUntilRefresh();
      if (wait) {
        showPTRMessage('New curiosities may be refreshed once a minute');
      } else {
        ptr.style.height  = '48px';
        ptr.style.opacity = '1';
        ptr.classList.add('loading');
        await doShuffle();
        ptr.style.height  = '0';
        ptr.style.opacity = '0';
        ptr.classList.remove('loading');
      }
    } else {
      ptr.style.height  = '0';
      ptr.style.opacity = '0';
    }
  });
}

async function doShuffle() {
  const cards     = document.getElementById('discover-cards');
  const loadingEl = document.getElementById('discover-loading');
  // Clear session — this pull will become the new session
  try { sessionStorage.removeItem('curio_cards'); } catch {}
  cards.innerHTML = '';
  loadingEl.style.display = 'flex';
  loadingEl.innerHTML = '<div class="spinner"></div><p>Gathering curiosities…</p>';
  try {
    await loadContent();
    lastRefreshTime = Date.now();
    localStorage.setItem('curio_last_load', Date.now());
    loadingEl.style.display = 'none';
    renderDiscover();
  } catch {
    loadingEl.innerHTML = '<div class="spinner"></div><p>Server waking up…<br><small>~30 seconds</small></p>';
    setTimeout(async () => {
      try {
        await loadContent();
        loadingEl.style.display = 'none';
        renderDiscover();
      } catch {
        loadingEl.style.display = 'none';
        cards.innerHTML = '<p class="empty-state">Could not reach the server. Pull down to try again.</p>';
      }
    }, 35000);
  }
}

// ─────────────────────────────────────────────────────────────────
//  THEME
// ─────────────────────────────────────────────────────────────────
function setTheme(theme) {
  state.theme = theme;
  document.getElementById('app').dataset.theme = theme;
  localStorage.setItem('curio_theme', theme);
  document.getElementById('theme-color-meta').content = theme === 'dark' ? '#0d0f14' : '#f4f0e8';
  const icon = document.getElementById('theme-icon');
  if (theme === 'light') {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    icon.innerHTML = `<circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  }
}

// ─────────────────────────────────────────────────────────────────
//  KEEP-ALIVE  —  Ping backend every 14 min so Render never sleeps
// ─────────────────────────────────────────────────────────────────
function startKeepAlive() {
  const ping = () => fetch(CONFIG.BACKEND_URL + '/health', { signal: AbortSignal.timeout(5000) }).catch(() => {});
  ping();
  setInterval(ping, 14 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────
//  PWA
// ─────────────────────────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function showInstallBanner(prompt) {
  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    <div class="install-text"><b>Install Curio</b><small>Add to home screen · works offline</small></div>
    <button class="install-action" id="install-yes">Install</button>
    <button class="install-close" id="install-no">✕</button>`;
  document.getElementById('discover-otd').prepend(banner);
  document.getElementById('install-yes').onclick = async () => {
    if (prompt) { prompt.prompt(); await prompt.userChoice; }
    banner.remove();
  };
  document.getElementById('install-no').onclick = () => {
    banner.remove();
    localStorage.setItem('curio_hide_install', '1');
  };
}

// ─────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────
async function init() {
  setTheme(state.theme);

  // Online/offline
  const updateOnline = () => {};
  window.addEventListener('online',  updateOnline);
  window.addEventListener('offline', updateOnline);

  // Nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => setTab(el.dataset.tab));
  });

  // Filter
  // Language dropdown
  document.getElementById('lang-btn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('lang-dropdown').classList.toggle('open');
    document.getElementById('filter-dropdown').classList.remove('open');
  });
  document.querySelectorAll('[data-lang]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.classList.contains('lang-soon')) return;
      state.activeLang = el.dataset.lang;
      document.querySelectorAll('[data-lang]').forEach(o => o.classList.remove('active'));
      el.classList.add('active');
      document.getElementById('lang-dropdown').classList.remove('open');
      document.getElementById('lang-btn').classList.toggle('active', el.dataset.lang !== 'all');
      // Filter locally — no new API call
      if (state.tab === 'discover') renderDiscover();
    });
  });

  // Category filter
  document.getElementById('filter-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleFilterDropdown();
    document.getElementById('lang-dropdown').classList.remove('open'); // close other
  });
  // Category filter — ONLY bind to buttons that have data-topic (not language buttons)
  document.querySelectorAll('.filter-opt[data-topic]').forEach(el => {
    el.addEventListener('click', () => setTopic(el.dataset.topic));
  });
  document.addEventListener('click', () => {
    document.getElementById('filter-dropdown').classList.remove('open');
    document.getElementById('lang-dropdown').classList.remove('open');
  });

  // Theme
  document.getElementById('theme-btn').addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // Shuffle

  // Show controls for discover tab
  document.getElementById('filter-wrap').style.display = 'block';

  // PWA
  registerSW();
  startKeepAlive();
  setupPullToRefresh();
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    if (!localStorage.getItem('curio_hide_install')) showInstallBanner(e);
  });

  // Restore from session first — no network call, no surprise refresh
  // Content only changes when user explicitly pulls down
  const loadingEl = document.getElementById('discover-loading');
  try {
    const saved = sessionStorage.getItem('curio_cards');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.length > 0) {
        state.allCards = parsed;
        state.cards    = parsed;
        parsed.forEach(c => cardCache.set(c.id, c));
        lastRefreshTime = Date.now(); // treat as freshly loaded
        loadingEl.style.display = 'none';
        renderDiscover();
        return; // ← do not fetch — user must pull to refresh
      }
    }
  } catch {}

  // No session yet (first ever visit or tab was closed) — fetch fresh
  try {
    loadingEl.style.display = 'flex';
    loadingEl.innerHTML = '<div class="spinner"></div><p>Gathering curiosities…</p>';
    await loadContent();
    lastRefreshTime = Date.now();
    loadingEl.style.display = 'none';
    renderDiscover();
  } catch (err) {
    loadingEl.innerHTML = '<div class="spinner"></div><p>Server waking up… <small>(~30s)</small></p>';
    setTimeout(async () => {
      try {
        await loadContent();
        lastRefreshTime = Date.now();
        loadingEl.style.display = 'none';
        renderDiscover();
      } catch {
        loadingEl.innerHTML = '<p class="empty-state">Could not connect. Check your connection and reload.</p>';
      }
    }, 35000);
  }
}

// ─────────────────────────────────────────────────────────────────
//  GLOBALS
// ─────────────────────────────────────────────────────────────────
window.toggleSave  = toggleSave;
window.copyLink    = copyLink;
window.removeSaved = removeSaved;

document.addEventListener('DOMContentLoaded', init);
