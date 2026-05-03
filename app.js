'use strict';

// ─────────────────────────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────────────────────────
const CONFIG = {
  BACKEND_URL:   'https://curio-backend-yxm1.onrender.com',
  CARDS_TO_SHOW: 50,
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



// No localStorage cache — every open fetches fresh content (Instagram-style)
async function loadContent() {
  const topic = state.activeTopic;
  const data  = await apiFetch('/api/feed?category=' + topic + '&limit=' + CONFIG.CARDS_TO_SHOW);
  state.cards = data.items || [];
  // Register all cards in the persistent cache for bookmark lookups
  state.cards.forEach(c => cardCache.set(c.id, c));
}

// ─────────────────────────────────────────────────────────────────
//  CARD RENDERING
// ─────────────────────────────────────────────────────────────────
const TOPIC_ICONS = {
  'life-sciences':     '🧬',
  'medicine':          '🩺',
  'pharma':            '💊',
  'ai-tech':           '🤖',
  'physical-sciences': '⚗️',
  'space':             '🔭',
  'earth':             '🌍',
  'society':           '🌐',
  'history':           '🏛',
  'arts-culture':      '🎨',
  'general':           '📖',
};

function tagClass(topic) {
  return 'topic-tag tag-' + (topic || 'general');
}

function tagLabel(topic) {
  const labels = {
    'life-sciences':     'Life Sciences',
    'medicine':          'Medicine',
    'pharma':            'Pharma',
    'ai-tech':           'AI & Tech',
    'physical-sciences': 'Physical Sciences',
    'space':             'Space',
    'earth':             'Earth',
    'society':           'Society',
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
  el.className = 'card' + (isOtd ? ' card-otd' : '');
  el.dataset.id = card.id;
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

  let cards = state.cards;
  if (state.activeTopic !== 'all') {
    cards = cards.filter(c => c.topic === state.activeTopic);
  }

  if (!cards.length) {
    container.innerHTML = '<p class="empty-state">No articles found for this topic. Try shuffling or selecting All.</p>';
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
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));

  document.getElementById('feed-discover').style.display = tab === 'discover' ? 'block' : 'none';
  document.getElementById('feed-saved').style.display    = tab === 'saved'    ? 'block' : 'none';

  document.getElementById('shuf-btn').style.display    = tab === 'discover' ? 'flex'  : 'none';
  document.getElementById('filter-wrap').style.display = tab === 'discover' ? 'block' : 'none';

  if (tab === 'saved') renderSaved();

  document.getElementById('feed').scrollTop = 0;
}

function setTopic(topic) {
  state.activeTopic = topic;
  document.querySelectorAll('.filter-opt').forEach(p => p.classList.toggle('active', p.dataset.topic === topic));
  const btn = document.getElementById('filter-btn');
  if (btn) btn.classList.toggle('active', topic !== 'all');
  document.getElementById('filter-dropdown').classList.remove('open');

  if (state.tab === 'discover') {
    // If switching to a new topic, fetch fresh content for that topic
    doShuffle();
  }
}

function toggleFilterDropdown() {
  document.getElementById('filter-dropdown').classList.toggle('open');
}

// ─────────────────────────────────────────────────────────────────
//  SHUFFLE
// ─────────────────────────────────────────────────────────────────
async function doShuffle() {
  const btn        = document.getElementById('shuf-btn');
  const cards      = document.getElementById('discover-cards');
  const loadingEl  = document.getElementById('discover-loading');

  btn.classList.add('spinning');
  cards.innerHTML  = '';
  loadingEl.style.display = 'flex';
  loadingEl.innerHTML = '<div class="spinner"></div><p>Loading new discoveries…</p>';

  try {
    await loadContent();
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
        cards.innerHTML = '<p class="empty-state">Could not reach the server. Try again in a moment.</p>';
      }
    }, 35000);
  }

  btn.classList.remove('spinning');
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
  document.getElementById('filter-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleFilterDropdown();
  });
  document.querySelectorAll('.filter-opt').forEach(el => {
    el.addEventListener('click', () => setTopic(el.dataset.topic));
  });
  document.addEventListener('click', () => {
    document.getElementById('filter-dropdown').classList.remove('open');
  });

  // Theme
  document.getElementById('theme-btn').addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // Shuffle
  document.getElementById('shuf-btn').addEventListener('click', doShuffle);

  // Show controls for discover tab
  document.getElementById('shuf-btn').style.display    = 'flex';
  document.getElementById('filter-wrap').style.display = 'block';

  // PWA
  registerSW();
  startKeepAlive();
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    if (!localStorage.getItem('curio_hide_install')) showInstallBanner(e);
  });


  // Auto-refresh when user returns to the app
  // Tracks when content was last loaded
  let lastLoadTime = Date.now();
  const REFRESH_AFTER_MS = 30 * 60 * 1000; // 30 minutes away = fresh feed on return

  async function refreshIfStale() {
    if (state.tab !== 'discover') return;
    if (Date.now() - lastLoadTime < REFRESH_AFTER_MS) return;
    lastLoadTime = Date.now();
    await doShuffle();
  }

  // Triggers: tab becomes visible again, or window gets focus (home screen re-open)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfStale();
  });
  window.addEventListener('focus', refreshIfStale);

  // Load content — no localStorage cache, always fresh
  const loadingEl = document.getElementById('discover-loading');
  try {
    loadingEl.style.display = 'flex';
    await loadContent();
    lastLoadTime = Date.now();
    loadingEl.style.display = 'none';
    renderDiscover();
  } catch (err) {
    loadingEl.innerHTML = '<div class="spinner"></div><p>Server waking up… <small>(~30s)</small></p>';
    setTimeout(async () => {
      try {
        await loadContent();
        lastLoadTime = Date.now();
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
