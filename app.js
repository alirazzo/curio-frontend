'use strict';

// ─────────────────────────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────────────────────────
const CONFIG = {
  BACKEND_URL:   'https://curio-backend-yxm1.onrender.com',
  CARDS_TO_SHOW: 50,
  NEWS_TO_SHOW:  30,
  CACHE_TTL_MS:       4 * 60 * 60 * 1000,  // 4 hours for learning content
  CACHE_TTL_NEWS_MS: 30 * 60 * 1000,       // 30 minutes for news
};

// ─────────────────────────────────────────────────────────────────
//  BIAS & RELIABILITY DATABASE
//  Sources: NewsGuard, Media Bias/Fact Check, AllSides
// ─────────────────────────────────────────────────────────────────
const BIAS_DB = {
  'theguardian.com': {
    score: 84,
    stance: 'Centre-Left',
    funding: 'Scott Trust (not-for-profit endowment). No paywall. Reader contributions. No single commercial owner — structurally protected from advertiser influence, but editorial perspective leans progressive.'
  },
  'bbc.com': {
    score: 88,
    stance: 'Centre (slight left-lean on social issues)',
    funding: 'UK TV licence fee — publicly funded but editorially independent by Royal Charter. Government controls licence fee level, creating indirect budget pressure. Historically credible foreign reporting.'
  },
  'reuters.com': {
    score: 93,
    stance: 'Centre / Neutral',
    funding: 'Thomson Reuters Corp (NYSE: TRI). Publicly traded wire service. Commercial incentives are accuracy and speed — not ideology. Primary wholesaler to other newsrooms, not a consumer brand.'
  },
  'apnews.com': {
    score: 95,
    stance: 'Centre / Neutral',
    funding: 'Not-for-profit cooperative owned by member newspapers. No single controlling shareholder. Least-biased wire by most independent rankings. Revenue from licensing to media clients.'
  },
  'npr.org': {
    score: 86,
    stance: 'Centre-Left',
    funding: 'Mix: federal funding via CPB (~1%), member station dues, corporate underwriting, listener donations. Editorially independent but audience and staff skew progressive. Strong investigative unit.'
  },
  'ft.com': {
    score: 89,
    stance: 'Pro-market / Centre-Right',
    funding: 'Nikkei Inc (Japanese media group, acquired 2015). Subscription-first. Business and finance angle colours editorial frame — cautious on regulation, sceptical of state intervention.'
  },
  'economist.com': {
    score: 90,
    stance: 'Classical Liberal / Centre-Right',
    funding: 'Economist Group. Staff own editorial content. Exor (Agnelli family), Schroders among shareholders. Strong globalisation and free-trade lens. Calls itself a newspaper, not a magazine.'
  },
  'nature.com': {
    score: 97,
    stance: 'Scientific consensus',
    funding: 'Springer Nature (academic publisher). Subscription + open access APCs. Peer-reviewed primary research. Editorials can take policy positions but news is strictly evidence-based.'
  },
  'scientificamerican.com': {
    score: 94,
    stance: 'Pro-science / Progressive on policy',
    funding: 'Springer Nature subsidiary. Subscription + digital advertising. 175+ year track record. Editorial stance on climate and public health aligns with scientific consensus.'
  },
  'theconversation.com': {
    score: 91,
    stance: 'Academic / Centre-Progressive',
    funding: 'University consortium (not-for-profit). Written by verified academics. No advertising. Peer-reviewed by editors before publication. Slight progressive lean from academic contributor pool.'
  },
  'smithsonianmag.com': {
    score: 92,
    stance: 'Neutral / Educational',
    funding: 'Smithsonian Institution (US government-chartered). Advertising-supported. Focus on science, history and culture. No significant political agenda.'
  },
  'nationalgeographic.com': {
    score: 90,
    stance: 'Pro-science / Environmentally focused',
    funding: 'National Geographic Partners — joint venture of National Geographic Society (non-profit) and The Walt Disney Company. Disney ownership since 2015. Advertising + subscription.'
  },
  'nasa.gov': {
    score: 98,
    stance: 'Scientific / Neutral',
    funding: 'US federal government agency. No commercial or political incentives on scientific content. Primary source for space and atmospheric data.'
  },
  'wikipedia.org': {
    score: 85,
    stance: 'Crowd-sourced / Generally neutral',
    funding: 'Wikimedia Foundation (non-profit, donor-funded). No advertising. Content written by volunteers — quality varies by article. Featured Articles and well-cited content is highly reliable.'
  },
  'bbc.co.uk': {
    score: 88,
    stance: 'Centre (slight left-lean on social issues)',
    funding: 'UK TV licence fee — publicly funded but editorially independent by Royal Charter.'
  },
};

// ─────────────────────────────────────────────────────────────────
//  TOPIC CONFIGURATION
// ─────────────────────────────────────────────────────────────────
const TOPIC_ICONS = {
  science:    '🔬',
  history:    '🏛',
  space:      '🔭',
  geography:  '🌍',
  economics:  '📊',
  art:        '🎨',
  biology:    '🧬',
  technology: '💡',
  general:    '📖',
};

const GUARDIAN_SECTION_MAP = {
  science: 'science',
  environment: 'science',
  world: 'geography',
  business: 'economics',
  technology: 'technology',
  culture: 'art',
  books: 'art',
  film: 'art',
  music: 'art',
  society: 'general',
  politics: 'general',
  education: 'general',
};

// ─────────────────────────────────────────────────────────────────
//  APPLICATION STATE
// ─────────────────────────────────────────────────────────────────
const state = {
  theme: localStorage.getItem('curio_theme') || 'dark',
  tab: 'home',
  activeTopic: 'all',
  homeCards: [],
  newsCards: [],
  savedIds: JSON.parse(localStorage.getItem('curio_saved_ids') || '[]'),
  savedCards: JSON.parse(localStorage.getItem('curio_saved_cards') || '[]'),
  deferredInstall: null,
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

function readTime(text) {
  if (!text) return '2 min';
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200)) + ' min';
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function inferTopic(text) {
  const t = (text || '').toLowerCase();
  if (/\b(space|planet|star|galaxy|nasa|astronaut|orbit|cosmos|asteroid|telescope|nebula|comet|solar system|black hole|mars|jupiter|saturn|moon landing)\b/.test(t)) return 'space';
  if (/\b(biology|cell|dna|rna|evolution|species|organism|gene|protein|bacteria|virus|ecology|microorganism|anatomy|physiology|neuroscience)\b/.test(t)) return 'biology';
  if (/\b(ancient|medieval|war|empire|century|dynasty|archaeological|historical|civilisation|civilization|king|queen|battle|revolution|roman|greek|egyptian|ottoman|colonial)\b/.test(t)) return 'history';
  if (/\b(country|river|mountain|ocean|continent|island|geography|climate|region|capital|volcano|earthquake|tectonic|glacier|rainforest|desert|coast)\b/.test(t)) return 'geography';
  if (/\b(economy|economic|financial|trade|market|gdp|inflation|currency|bank|investment|tax|fiscal|imf|recession|growth|monetary)\b/.test(t)) return 'economics';
  if (/\b(art|music|painting|sculpture|architecture|literature|poem|composer|artist|museum|gallery|novel|film|cinema|photography|theatre|opera)\b/.test(t)) return 'art';
  if (/\b(software|computer|algorithm|internet|digital|code|programming|artificial intelligence|ai|robot|technology|machine learning|startup|semiconductor)\b/.test(t)) return 'technology';
  return 'science';
}

function scoreColor(n) {
  if (n >= 90) return 'hi';
  if (n >= 80) return 'mid';
  return 'lo';
}

function getCached(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > (ttl || CONFIG.CACHE_TTL_MS)) return null;
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch (e) {
    // localStorage full — clear old caches
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('curio_cache_')) localStorage.removeItem(k);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
//  API FETCHERS — All content comes from the Render backend
// ─────────────────────────────────────────────────────────────────

async function apiFetch(path) {
  const r = await fetch(CONFIG.BACKEND_URL + path, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Backend ' + r.status + ': ' + path);
  return r.json();
}

async function fetchOnThisDay() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const r = await fetch('https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/' + m + '/' + day, { signal: AbortSignal.timeout(8000) });
  const data = await r.json();
  const events = (data.events || []).filter(e => e.pages && e.pages[0] && e.pages[0].thumbnail);
  if (!events.length) return null;
  const evt = events[Math.floor(Math.random() * Math.min(5, events.length))];
  const pg = evt.pages[0];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return {
    id: 'otd_' + evt.year,
    source: 'wikipedia.org', sourceLabel: 'Wikipedia', verified: true,
    title: evt.year + ' — ' + evt.text,
    excerpt: (pg.extract || evt.text).replace(/<[^>]+>/g,'').slice(0, 220) + '...',
    image: pg.thumbnail.source,
    url: (pg.content_urls && pg.content_urls.desktop) ? pg.content_urls.desktop.page : 'https://en.wikipedia.org',
    topic: 'history', readTime: '2 min', type: 'otd',
    dateLabel: 'On this day — ' + months[d.getMonth()] + ' ' + d.getDate(),
  };
}

async function loadHomeContent() {
  const cacheKey = 'curio_cache_home';
  const cached = getCached(cacheKey);
  if (cached) { state.homeCards = cached; return; }
  const data = await apiFetch('/api/feed?category=all&limit=' + CONFIG.CARDS_TO_SHOW);
  state.homeCards = data.items || [];
  setCache(cacheKey, state.homeCards);
}

async function loadNewsContent() {
  const cacheKey = 'curio_cache_news';
  const cached = getCached(cacheKey, CONFIG.CACHE_TTL_NEWS_MS);
  if (cached) { state.newsCards = cached; return; }
  const data = await apiFetch('/api/news?limit=' + CONFIG.NEWS_TO_SHOW);
  state.newsCards = data.items || [];
  setCache(cacheKey, state.newsCards);
}

// ─────────────────────────────────────────────────────────────────
//  CARD RENDERING
// ─────────────────────────────────────────────────────────────────
function cardImageHtml(card) {
  const icon = TOPIC_ICONS[card.topic] || '📖';
  const tagClass = `topic-tag tag-${card.topic}`;
  const topicLabel = card.topic.charAt(0).toUpperCase() + card.topic.slice(1);
  return `
    <div class="card-img-wrap">
      <img
        src="${card.image}"
        alt="${card.title.replace(/"/g, '&quot;')}"
        loading="lazy"
        onload="this.classList.remove('loading')"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
        class="loading"
      >
      <div class="img-fallback" style="display:none">${icon}</div>
      <span class="${tagClass} topic-badge-img">${topicLabel}</span>
    </div>`;
}

function cardMetaHtml(card) {
  return `
    <div class="card-meta">
      <span class="source-label">
        ${card.sourceLabel}
        ${card.verified ? '<span class="verified-check"><svg viewBox="0 0 10 10"><path d="M1.5 5l2.5 2.5 4.5-4.5"/></svg></span>' : ''}
      </span>
      <span class="read-time">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${card.readTime}
      </span>
    </div>`;
}

function cardActionsHtml(card) {
  const saved = state.savedIds.includes(card.id);
  const title = encodeURIComponent(card.title);
  const url = encodeURIComponent(card.url);
  return `
    <div class="card-actions">
      <button class="save-btn ${saved ? 'saved' : ''}" onclick="toggleSave('${card.id}', this)" aria-label="Save">
        <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        <span>${saved ? 'Saved' : 'Save'}</span>
      </button>
      <div class="share-group">
        <button class="share-btn" onclick="shareVia('whatsapp','${title}','${url}')" title="Share on WhatsApp">📱</button>
        <button class="share-btn" onclick="shareVia('email','${title}','${url}')" title="Share via Email">✉️</button>
        <button class="share-btn" onclick="shareVia('messenger','${title}','${url}')" title="Share on Messenger">💬</button>
      </div>
    </div>`;
}

function buildLearnCard(card, isOtd = false) {
  const el = document.createElement('article');
  el.className = 'card' + (isOtd ? ' card-otd' : '');
  el.dataset.id = card.id;
  el.dataset.topic = card.topic;
  el.innerHTML = `
    ${cardImageHtml(card)}
    <div class="card-body">
      <div class="swipe-hints">
        <span class="swipe-hint"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> dismiss</span>
        <span class="swipe-hint">save <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </div>
      ${cardMetaHtml(card)}
      <h2 class="card-title">${card.title}</h2>
      <p class="card-excerpt">${card.excerpt}</p>
      <a class="card-link" href="${card.url}" target="_blank" rel="noopener noreferrer">
        Read on ${card.sourceLabel}
        <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
      ${cardActionsHtml(card)}
    </div>`;
  return el;
}

function buildNewsCard(card) {
  const bias = {
    score: card.score || 80,
    stance: card.stance || 'Unknown',
    funding: card.funding || 'See source website.'
  };
  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.id = card.id;
  el.dataset.topic = card.topic;
  el.innerHTML = `
    ${cardImageHtml(card)}
    <div class="card-body">
      ${cardMetaHtml(card)}
      <h2 class="card-title">${card.title}</h2>
      <p class="card-excerpt">${card.excerpt}</p>
      <a class="card-link" href="${card.url}" target="_blank" rel="noopener noreferrer">
        Read on ${card.sourceLabel}
        <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
      <div class="bias-panel">
        <div class="bias-info">
          <div class="bias-label">Political stance &amp; funding</div>
          <div class="bias-stance">${bias.stance}</div>
          <div class="bias-funding">${bias.funding}</div>
        </div>
        <div class="reliability-block">
          <div class="rel-score ${scoreColor(bias.score)}">${bias.score}</div>
          <div class="rel-label">reliability<br>/100</div>
        </div>
      </div>
      ${cardActionsHtml(card)}
    </div>`;
  return el;
}

// ─────────────────────────────────────────────────────────────────
//  RENDER SECTIONS
// ─────────────────────────────────────────────────────────────────
function renderHome() {
  const container = document.getElementById('home-cards');
  const otdContainer = document.getElementById('home-otd');
  const discLabel = document.getElementById('home-disc-label');

  container.innerHTML = '';
  otdContainer.innerHTML = '';

  let cards = state.homeCards;
  if (state.activeTopic !== 'all') {
    cards = cards.filter(c => c.topic === state.activeTopic);
  }

  if (!cards.length) {
    container.innerHTML = '<p class="empty-state">No cards for this topic yet. Try shuffling or selecting All.</p>';
    return;
  }

  discLabel.style.display = 'block';

  cards.forEach(card => {
    container.appendChild(buildLearnCard(card));
  });
}

function renderOtd(card) {
  if (!card) return;
  const otdContainer = document.getElementById('home-otd');
  const label = document.createElement('p');
  label.className = 'section-label';
  label.textContent = card.dateLabel || 'On this day';
  otdContainer.appendChild(label);
  otdContainer.appendChild(buildLearnCard(card, true));
}

function renderNews() {
  const container = document.getElementById('news-cards');
  const band = document.getElementById('breaking-band');
  const lbl = document.getElementById('news-lbl');
  container.innerHTML = '';

  let cards = state.newsCards;
  if (state.activeTopic !== 'all') {
    cards = cards.filter(c => c.topic === state.activeTopic);
  }

  if (!cards.length) {
    container.innerHTML = '<p class="empty-state">No news loaded yet. Check your connection.</p>';
    return;
  }

  band.style.display = 'flex';
  lbl.style.display = 'block';

  cards.forEach(card => {
    container.appendChild(buildNewsCard(card));
  });
}

function renderSaved() {
  const container = document.getElementById('saved-list');
  const empty = document.getElementById('saved-empty');
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
        <div class="saved-title">${card.title}</div>
        <div class="saved-meta">${card.sourceLabel} · ${card.topic} · ${card.readTime}</div>
      </div>
      <button class="saved-del" onclick="removeSaved('${card.id}')" aria-label="Remove">✕</button>`;
    el.querySelector('.saved-thumb').onclick = () => window.open(card.url, '_blank');
    el.querySelector('.saved-body').onclick = () => window.open(card.url, '_blank');
    container.appendChild(el);
  });
}

const QUIZ_QUESTIONS = [
  {
    topic: 'Space · nasa.gov',
    q: 'Which planet has a day longer than its year?',
    opts: ['Mercury', 'Venus', 'Mars', 'Jupiter'],
    correct: 1,
    explanation: 'Venus takes 243 Earth days to rotate but only 225 to orbit the Sun.'
  },
  {
    topic: 'History · wikipedia.org',
    q: 'The Silk Road primarily connected which two regions?',
    opts: ['India and Africa', 'China and the Mediterranean', 'Arabia and Europe', 'Persia and India'],
    correct: 1,
    explanation: 'The Silk Road was a 4,000-mile network linking China to the Mediterranean for 1,500 years.'
  },
  {
    topic: 'Science · nature.com',
    q: 'Approximately how many lightning strikes hit Earth every second?',
    opts: ['10', '50', '100', '500'],
    correct: 2,
    explanation: 'Earth receives about 100 lightning strikes per second — roughly 8 million per day.'
  },
  {
    topic: 'Biology · nih.gov',
    q: 'How many neurons does the enteric (gut) nervous system contain?',
    opts: ['5 million', '100 million', '500 million', '5 billion'],
    correct: 2,
    explanation: 'The gut has ~500 million neurons — more than the spinal cord — and operates largely independently.'
  },
  {
    topic: 'Geography · nationalgeographic.com',
    q: 'Which country holds the most freshwater lakes on Earth?',
    opts: ['Brazil', 'Russia', 'USA', 'Canada'],
    correct: 3,
    explanation: 'Canada has over 2 million lakes, holding ~20% of the world\'s fresh surface water.'
  },
];

function renderQuiz() {
  const container = document.getElementById('quiz-cards');
  container.innerHTML = '';
  QUIZ_QUESTIONS.forEach((q, idx) => {
    const el = document.createElement('div');
    el.className = 'quiz-card';
    el.innerHTML = `
      <div class="quiz-num">Question ${idx + 1} of ${QUIZ_QUESTIONS.length} · ${q.topic}</div>
      <p class="quiz-question">${q.q}</p>
      <div class="quiz-options">
        ${q.opts.map((opt, i) => `<button class="quiz-opt" onclick="answerQuiz(this,${i},${q.correct},'${q.explanation.replace(/'/g, "\\'")}',${idx})">${String.fromCharCode(65 + i)}. ${opt}</button>`).join('')}
      </div>
      <p class="quiz-feedback" id="qfb-${idx}"></p>`;
    container.appendChild(el);
  });
}

// ─────────────────────────────────────────────────────────────────
//  INTERACTIONS
// ─────────────────────────────────────────────────────────────────
function toggleSave(id, btn) {
  const allCards = [...state.homeCards, ...state.newsCards];
  const card = allCards.find(c => c.id === id);
  if (!card) return;

  if (state.savedIds.includes(id)) {
    state.savedIds = state.savedIds.filter(x => x !== id);
    state.savedCards = state.savedCards.filter(c => c.id !== id);
    document.querySelectorAll(`.save-btn`).forEach(b => {
      if (b.closest('[data-id="' + id + '"]')) {
        b.classList.remove('saved');
        b.querySelector('span').textContent = 'Save';
      }
    });
  } else {
    state.savedIds.push(id);
    state.savedCards.push(card);
    document.querySelectorAll(`.save-btn`).forEach(b => {
      if (b.closest('[data-id="' + id + '"]')) {
        b.classList.add('saved');
        b.querySelector('span').textContent = 'Saved';
      }
    });
  }
  localStorage.setItem('curio_saved_ids', JSON.stringify(state.savedIds));
  localStorage.setItem('curio_saved_cards', JSON.stringify(state.savedCards));
}

function removeSaved(id) {
  state.savedIds = state.savedIds.filter(x => x !== id);
  state.savedCards = state.savedCards.filter(c => c.id !== id);
  localStorage.setItem('curio_saved_ids', JSON.stringify(state.savedIds));
  localStorage.setItem('curio_saved_cards', JSON.stringify(state.savedCards));
  renderSaved();
}

function shareVia(platform, title, url) {
  const decodedTitle = decodeURIComponent(title);
  const decodedUrl = decodeURIComponent(url);
  const text = `${decodedTitle} — ${decodedUrl}`;
  const links = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
    email: `mailto:?subject=${encodeURIComponent(decodedTitle)}&body=${encodeURIComponent(text)}`,
    messenger: `https://www.facebook.com/dialog/send?link=${encodeURIComponent(decodedUrl)}&app_id=181274745809571`,
  };
  window.open(links[platform], '_blank');
}

function answerQuiz(btn, chosen, correct, explanation, qIdx) {
  const opts = btn.closest('.quiz-options').querySelectorAll('.quiz-opt');
  opts.forEach(o => { o.disabled = true; });
  btn.classList.add(chosen === correct ? 'correct' : 'wrong');
  if (chosen !== correct) opts[correct].classList.add('correct');
  const fb = document.getElementById('qfb-' + qIdx);
  fb.textContent = (chosen === correct ? '✓ Correct! ' : '✗ Not quite. ') + explanation;
  fb.style.color = chosen === correct ? '#1D9E75' : '#993556';
}

// ─────────────────────────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────────────────────────
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  document.getElementById('feed-home').style.display  = tab === 'home'  ? 'block' : 'none';
  document.getElementById('feed-news').style.display  = tab === 'news'  ? 'block' : 'none';
  document.getElementById('feed-saved').style.display = tab === 'saved' ? 'block' : 'none';
  document.getElementById('feed-quiz').style.display  = tab === 'quiz'  ? 'block' : 'none';

  const isDiscovery = tab === 'home' || tab === 'news';
  document.getElementById('shuf-btn').style.display    = tab === 'home' ? 'flex' : 'none';
  document.getElementById('filter-wrap').style.display = isDiscovery ? 'block' : 'none';

  if (tab === 'saved') renderSaved();
  if (tab === 'quiz') renderQuiz();

  document.getElementById('feed').scrollTop = 0;
}

function setTopic(topic) {
  state.activeTopic = topic;
  // Update active state on dropdown options
  document.querySelectorAll('.filter-opt').forEach(p => {
    p.classList.toggle('active', p.dataset.topic === topic);
  });
  // Update filter button to show active state
  const btn = document.getElementById('filter-btn');
  btn.classList.toggle('filter-active', topic !== 'all');
  // Close dropdown
  document.getElementById('filter-dropdown').classList.remove('open');
  if (state.tab === 'home') renderHome();
  if (state.tab === 'news') renderNews();
}

function toggleFilterDropdown() {
  document.getElementById('filter-dropdown').classList.toggle('open');
}

// ─────────────────────────────────────────────────────────────────
//  SHUFFLE
// ─────────────────────────────────────────────────────────────────
async function doShuffle() {
  const btn = document.getElementById('shuf-btn');
  const container = document.getElementById('home-cards');

  btn.classList.add('spinning');
  container.style.opacity = '0.25';
  container.style.transition = 'opacity 0.2s';

  // Always bust cache and fetch genuinely fresh content from backend
  localStorage.removeItem('curio_cache_home');

  try {
    await loadHomeContent();          // fetch new random batch from server
  } catch {
    // If backend is asleep or offline, fall back to reshuffling what we have
    state.homeCards = shuffle(state.homeCards);
  }

  renderHome();
  container.style.opacity = '1';
  btn.classList.remove('spinning');
}

// ─────────────────────────────────────────────────────────────────
//  KEEP-ALIVE  —  Ping backend every 14 min so Render never sleeps
// ─────────────────────────────────────────────────────────────────
function startKeepAlive() {
  const ping = () => fetch(CONFIG.BACKEND_URL + '/health', { signal: AbortSignal.timeout(5000) }).catch(() => {});
  ping(); // immediate ping on load
  setInterval(ping, 14 * 60 * 1000);
}


function setTheme(theme) {
  state.theme = theme;
  document.getElementById('app').dataset.theme = theme;
  localStorage.setItem('curio_theme', theme);
  const meta = document.getElementById('theme-color-meta');
  meta.content = theme === 'dark' ? '#0d0f14' : '#f4f0e8';
  const icon = document.getElementById('theme-icon');
  if (theme === 'light') {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    icon.innerHTML = `
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  }
}


// ─────────────────────────────────────────────────────────────────
//  SERVICE WORKER REGISTRATION (PWA)
// ─────────────────────────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────
//  PWA INSTALL BANNER
// ─────────────────────────────────────────────────────────────────
function showInstallBanner(deferredPrompt) {
  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    <div class="install-text">
      <b>Install Curio</b>
      <small>Add to home screen · works offline</small>
    </div>
    <button class="install-action" id="install-action-btn">Install</button>
    <button class="install-close" id="install-close-btn">✕</button>`;
  document.getElementById('home-otd').prepend(banner);

  document.getElementById('install-action-btn').onclick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    }
    banner.remove();
  };
  document.getElementById('install-close-btn').onclick = () => {
    banner.remove();
    localStorage.setItem('curio_hide_install', '1');
  };
}

// ─────────────────────────────────────────────────────────────────
//  OFFLINE DETECTION
// ─────────────────────────────────────────────────────────────────
function updateOnlineStatus() {
  const pill = document.getElementById('offline-pill');
  pill.style.display = navigator.onLine ? 'none' : 'inline';
}

// ─────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────
async function init() {
  // Apply saved theme
  setTheme(state.theme);

  // Online/offline
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Nav buttons
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => setTab(el.dataset.tab));
  });

  // Filter dropdown
  document.getElementById('filter-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFilterDropdown();
  });
  document.querySelectorAll('.filter-opt').forEach(el => {
    el.addEventListener('click', () => setTopic(el.dataset.topic));
  });
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    document.getElementById('filter-dropdown').classList.remove('open');
  });

  // Theme toggle
  document.getElementById('theme-btn').addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // Shuffle button
  document.getElementById('shuf-btn').addEventListener('click', doShuffle);

  // PWA
  registerSW();
  startKeepAlive();
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    if (!localStorage.getItem('curio_hide_install')) {
      showInstallBanner(e);
    }
  });

  // Show home tab controls
  document.getElementById('shuf-btn').style.display    = 'flex';
  document.getElementById('filter-wrap').style.display = 'block';

  // Load content in parallel
  try {
    const [otdCard] = await Promise.all([
      fetchOnThisDay().catch(() => null),
      loadHomeContent(),
    ]);

    document.getElementById('home-loading').style.display = 'none';
    if (otdCard) renderOtd(otdCard);
    renderHome();
  } catch (err) {
    document.getElementById('home-loading').innerHTML =
      '<p class="empty-state">Could not load content. Check your connection and refresh.</p>';
    console.error('Home load error:', err);
  }

  // Load news in background
  loadNewsContent().then(() => {
    const badge = document.getElementById('news-badge');
    if (state.newsCards.length > 0) badge.style.display = 'block';
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
//  EXPOSE GLOBALS (called from inline HTML onclick handlers)
// ─────────────────────────────────────────────────────────────────
window.toggleSave = toggleSave;
window.shareVia = shareVia;
window.answerQuiz = answerQuiz;
window.removeSaved = removeSaved;

document.addEventListener('DOMContentLoaded', init);