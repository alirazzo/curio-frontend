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

const QUIZ_POOL = [
  // Space
  { topic:'Space', q:'Which planet has a day longer than its year?', opts:['Mercury','Venus','Mars','Jupiter'], correct:1, explanation:'Venus takes 243 Earth days to rotate but only 225 to orbit the Sun — and it spins backwards.' },
  { topic:'Space', q:'What is the nearest star to Earth after the Sun?', opts:['Barnard\'s Star','Sirius','Proxima Centauri','Vega'], correct:2, explanation:'Proxima Centauri is about 4.24 light-years away, making it our closest stellar neighbour.' },
  { topic:'Space', q:'How many moons does Mars have?', opts:['0','1','2','4'], correct:2, explanation:'Mars has two small moons: Phobos and Deimos, likely captured asteroids.' },
  { topic:'Space', q:'What is a neutron star made of mostly?', opts:['Iron','Hydrogen plasma','Neutrons','Dark matter'], correct:2, explanation:'Neutron stars are so dense that protons and electrons are crushed together into neutrons.' },
  { topic:'Space', q:'The Great Red Spot on Jupiter is a storm that has lasted approximately how long?', opts:['50 years','200 years','350+ years','1,000 years'], correct:2, explanation:'The Great Red Spot has been observed since the 1600s — a persistent anticyclonic storm wider than Earth.' },
  // Science
  { topic:'Science', q:'Approximately how many lightning strikes hit Earth every second?', opts:['10','50','100','500'], correct:2, explanation:'Earth receives about 100 lightning strikes per second — roughly 8 million per day.' },
  { topic:'Science', q:'What is the hardest natural substance on Earth?', opts:['Titanium','Quartz','Graphene','Diamond'], correct:3, explanation:'Diamond scores 10 on the Mohs scale. Graphene is stronger but diamond is the hardest naturally occurring mineral.' },
  { topic:'Science', q:'What percentage of the ocean has been explored by humans?', opts:['5%','20%','50%','80%'], correct:0, explanation:'Only about 5% of Earth\'s oceans have been explored. The deep sea remains largely unmapped.' },
  { topic:'Science', q:'At what temperature are Celsius and Fahrenheit equal?', opts:['-40°','-32°','0°','32°'], correct:0, explanation:'At −40°, both scales intersect. The formula where °C = °F gives exactly −40.' },
  { topic:'Science', q:'What is the most abundant gas in Earth\'s atmosphere?', opts:['Oxygen','Carbon dioxide','Argon','Nitrogen'], correct:3, explanation:'Nitrogen makes up about 78% of Earth\'s atmosphere; oxygen is about 21%.' },
  // Biology
  { topic:'Biology', q:'How many neurons does the gut\'s enteric nervous system contain?', opts:['5 million','100 million','500 million','5 billion'], correct:2, explanation:'The gut has ~500 million neurons — more than the spinal cord — and operates largely independently.' },
  { topic:'Biology', q:'What percentage of human DNA is shared with a banana?', opts:['10%','30%','50%','60%'], correct:3, explanation:'Humans share roughly 60% of their DNA with bananas — reflecting common ancestry of all eukaryotic life.' },
  { topic:'Biology', q:'How many cells are in the average adult human body?', opts:['37 million','370 million','37 billion','37 trillion'], correct:3, explanation:'The human body contains approximately 37 trillion cells, roughly 84% of which are red blood cells.' },
  { topic:'Biology', q:'What is the longest-living vertebrate known to science?', opts:['Giant tortoise','Bowhead whale','Greenland shark','Koi fish'], correct:2, explanation:'Greenland sharks can live over 400 years, making them the longest-lived vertebrates known.' },
  { topic:'Biology', q:'What molecule carries genetic instructions in all living organisms?', opts:['Protein','ATP','DNA','Glucose'], correct:2, explanation:'DNA (deoxyribonucleic acid) encodes the genetic instructions used in the development and functioning of all known organisms.' },
  // History
  { topic:'History', q:'The Silk Road primarily connected which two regions?', opts:['India and Africa','China and the Mediterranean','Arabia and Europe','Persia and India'], correct:1, explanation:'The Silk Road was a 4,000-mile network linking China to the Mediterranean for 1,500 years.' },
  { topic:'History', q:'In what year did the Berlin Wall fall?', opts:['1987','1989','1991','1993'], correct:1, explanation:'The Berlin Wall fell on November 9, 1989, marking a pivotal moment in the end of the Cold War.' },
  { topic:'History', q:'Which empire was the largest contiguous land empire in history?', opts:['Roman Empire','British Empire','Mongol Empire','Ottoman Empire'], correct:2, explanation:'At its peak in the 13th century, the Mongol Empire covered 24 million km² — the largest contiguous land empire ever.' },
  { topic:'History', q:'What ancient wonder survived into the modern era?', opts:['Colossus of Rhodes','Hanging Gardens','Great Pyramid of Giza','Lighthouse of Alexandria'], correct:2, explanation:'The Great Pyramid of Giza is the only ancient wonder still standing, built around 2560 BCE.' },
  { topic:'History', q:'The Black Death killed approximately what fraction of Europe\'s population in the 14th century?', opts:['One in ten','One in four','One in three','One in two'], correct:2, explanation:'The Black Death killed roughly one-third of Europe\'s population between 1347 and 1351.' },
  // Geography
  { topic:'Geography', q:'Which country has the most freshwater lakes on Earth?', opts:['Brazil','Russia','USA','Canada'], correct:3, explanation:'Canada has over 2 million lakes, holding ~20% of the world\'s fresh surface water.' },
  { topic:'Geography', q:'What is the longest river in the world?', opts:['Amazon','Congo','Yangtze','Nile'], correct:3, explanation:'The Nile stretches approximately 6,650 km through northeastern Africa, though the Amazon rivals it by some measures.' },
  { topic:'Geography', q:'Which country has the most UNESCO World Heritage Sites?', opts:['China','France','Italy','Spain'], correct:2, explanation:'Italy has the most UNESCO World Heritage Sites with 58, followed closely by China and Germany.' },
  { topic:'Geography', q:'Which ocean is the world\'s largest?', opts:['Atlantic','Arctic','Indian','Pacific'], correct:3, explanation:'The Pacific Ocean covers more than 165 million km² — larger than all land on Earth combined.' },
  { topic:'Geography', q:'Iceland sits on the boundary of which two tectonic plates?', opts:['Pacific and North American','Eurasian and North American','African and Eurasian','Arabian and Eurasian'], correct:1, explanation:'The Mid-Atlantic Ridge runs through Iceland, the only place this tectonic boundary is above sea level.' },
  // Economics
  { topic:'Economics', q:'What does GDP stand for?', opts:['Gross Domestic Product','General Debt Position','Global Development Plan','Gross Deficit Percentage'], correct:0, explanation:'GDP (Gross Domestic Product) measures the total monetary value of goods and services produced in a country.' },
  { topic:'Economics', q:'Which currency is most traded globally by volume?', opts:['Euro','Chinese Yuan','US Dollar','Japanese Yen'], correct:2, explanation:'The US Dollar is involved in about 88% of all foreign exchange transactions globally.' },
  { topic:'Economics', q:'What is the main function of a central bank?', opts:['Lending to individuals','Managing national currency and monetary policy','Regulating stock markets','Collecting corporate taxes'], correct:1, explanation:'Central banks manage a country\'s monetary policy, control money supply, and often act as lender of last resort to banks.' },
  // Medicine
  { topic:'Medicine', q:'What is CRISPR primarily used for?', opts:['Drug delivery','Gene editing','Brain scanning','Virus detection'], correct:1, explanation:'CRISPR-Cas9 is a gene-editing technology that allows precise modifications to DNA sequences in living organisms.' },
  { topic:'Medicine', q:'How many bones are in the adult human body?', opts:['186','206','226','246'], correct:1, explanation:'Adults have 206 bones. Infants are born with about 270, which fuse over time.' },
  { topic:'Medicine', q:'What organ produces insulin?', opts:['Liver','Kidney','Stomach','Pancreas'], correct:3, explanation:'The pancreas produces insulin in clusters of cells called the Islets of Langerhans, regulating blood glucose.' },
  { topic:'Medicine', q:'What is the most common blood type globally?', opts:['A+','B+','AB+','O+'], correct:3, explanation:'O+ is the most common blood type worldwide, present in about 38% of the global population.' },
  // Pharma
  { topic:'Pharma', q:'What does mRNA in mRNA vaccines instruct the body to do?', opts:['Destroy viruses directly','Produce a viral protein to trigger immunity','Strengthen white blood cells','Block viral receptor sites'], correct:1, explanation:'mRNA vaccines deliver instructions for cells to produce a harmless viral protein, triggering an immune response without using live virus.' },
  { topic:'Pharma', q:'What class of drugs are statins?', opts:['Antibiotics','Antivirals','Cholesterol-lowering agents','Blood pressure reducers'], correct:2, explanation:'Statins inhibit HMG-CoA reductase, an enzyme involved in cholesterol synthesis, reducing LDL levels.' },
  { topic:'Pharma', q:'What was the first antibiotic discovered?', opts:['Amoxicillin','Tetracycline','Streptomycin','Penicillin'], correct:3, explanation:'Alexander Fleming discovered penicillin in 1928 when he noticed mould killing bacteria on a petri dish.' },
  // Microbiology
  { topic:'Microbiology', q:'What percentage of the human body\'s cells are microbial?', opts:['10%','30%','50%','Over 50%'], correct:3, explanation:'By cell count, microbial cells match or slightly outnumber human cells — roughly 38 trillion vs 30 trillion.' },
  { topic:'Microbiology', q:'Which of these is NOT a domain of life?', opts:['Bacteria','Archaea','Eukarya','Protista'], correct:3, explanation:'The three domains of life are Bacteria, Archaea, and Eukarya. Protista is a kingdom within Eukarya, not a domain.' },
  { topic:'Microbiology', q:'How many viral particles are estimated to exist on Earth?', opts:['10 trillion','10 quadrillion','10^31','10^31'], correct:2, explanation:'Estimates suggest approximately 10^31 virus particles on Earth — more than all other biological entities combined.' },
  // Technology
  { topic:'Technology', q:'What does HTTP stand for?', opts:['HyperText Transfer Protocol','High Traffic Transmission Pathway','Hosted Technology Transfer Protocol','HyperText Translation Programme'], correct:0, explanation:'HTTP (HyperText Transfer Protocol) is the foundation of data communication on the World Wide Web.' },
  { topic:'Technology', q:'Who is credited with writing the first computer algorithm?', opts:['Alan Turing','Charles Babbage','Ada Lovelace','Grace Hopper'], correct:2, explanation:'Ada Lovelace wrote the first algorithm intended for Charles Babbage\'s Analytical Engine in 1843.' },
  { topic:'Technology', q:'What does AI stand for in computing?', opts:['Automated Integration','Artificial Intelligence','Advanced Interface','Algorithmic Indexing'], correct:1, explanation:'Artificial Intelligence refers to the simulation of human intelligence processes by computer systems.' },
  // Art
  { topic:'Art', q:'Who painted the Sistine Chapel ceiling?', opts:['Leonardo da Vinci','Raphael','Caravaggio','Michelangelo'], correct:3, explanation:'Michelangelo painted the Sistine Chapel ceiling between 1508 and 1512 at the commission of Pope Julius II.' },
  { topic:'Art', q:'What movement did Pablo Picasso co-found?', opts:['Surrealism','Impressionism','Cubism','Dadaism'], correct:2, explanation:'Picasso and Georges Braque developed Cubism around 1907–1908, revolutionising Western art\'s representation of space.' },
  { topic:'Art', q:'The Louvre is located in which city?', opts:['Rome','Madrid','London','Paris'], correct:3, explanation:'The Louvre in Paris is the world\'s largest art museum, housing over 380,000 objects including the Mona Lisa.' },
  // Literature
  { topic:'Literature', q:'Who wrote "One Hundred Years of Solitude"?', opts:['Mario Vargas Llosa','Jorge Luis Borges','Pablo Neruda','Gabriel García Márquez'], correct:3, explanation:'García Márquez published "Cien años de soledad" in 1967, the defining work of magical realism, earning him the 1982 Nobel Prize.' },
  { topic:'Literature', q:'In what language did Dante write the Divine Comedy?', opts:['Latin','French','Italian','Greek'], correct:2, explanation:'Dante wrote the Divine Comedy in vernacular Italian, not Latin, helping establish Tuscan as the literary standard for Italian.' },
  { topic:'Literature', q:'Which novel begins with "It was the best of times, it was the worst of times"?', opts:['Bleak House','Great Expectations','Oliver Twist','A Tale of Two Cities'], correct:3, explanation:'Charles Dickens opened "A Tale of Two Cities" (1859) with this famous antithesis describing revolutionary France and England.' },
  // Philosophy
  { topic:'Philosophy', q:'Who wrote "Critique of Pure Reason"?', opts:['Hegel','Nietzsche','Kant','Descartes'], correct:2, explanation:'Immanuel Kant published the Critique of Pure Reason in 1781, one of the most influential texts in Western philosophy.' },
  { topic:'Philosophy', q:'What is the philosophical concept of "Occam\'s Razor"?', opts:['The most complex explanation is most likely correct','The simplest explanation with fewest assumptions is preferred','Truth is always between two extremes','All knowledge comes from experience'], correct:1, explanation:'Occam\'s Razor states that among competing hypotheses, the one with the fewest assumptions should be selected.' },
  { topic:'Philosophy', q:'Plato\'s "Allegory of the Cave" describes what philosophical idea?', opts:['The nature of justice','The problem of free will','The difference between perception and reality','The ethics of governance'], correct:2, explanation:'The Allegory of the Cave illustrates how humans mistake sensory experience for true reality, and the philosopher\'s role in seeking deeper truth.' },
  // AI
  { topic:'AI', q:'What does "GPT" stand for in AI language models?', opts:['General Processing Technology','Generative Pre-trained Transformer','Guided Prediction Tool','Global Protocol for Training'], correct:1, explanation:'GPT stands for Generative Pre-trained Transformer, a type of large language model architecture.' },
  { topic:'AI', q:'What is the "Turing Test"?', opts:['A benchmark for computing speed','A test for measuring machine learning accuracy','A conversation test to determine if a machine can exhibit human-like intelligence','A mathematical proof about computational limits'], correct:2, explanation:'Alan Turing proposed the test in 1950: if a machine can converse indistinguishably from a human, it can be considered intelligent.' },
  // Chemistry
  { topic:'Chemistry', q:'What is the chemical symbol for gold?', opts:['Go','Gd','Au','Ag'], correct:2, explanation:'Gold\'s symbol Au comes from the Latin "aurum." It\'s one of the few elements known since antiquity.' },
  { topic:'Chemistry', q:'How many elements are in the periodic table?', opts:['92','108','118','126'], correct:2, explanation:'As of 2023, the periodic table contains 118 confirmed elements, with elements 1-94 occurring naturally.' },
  { topic:'Chemistry', q:'What is the most electronegative element?', opts:['Oxygen','Chlorine','Fluorine','Nitrogen'], correct:2, explanation:'Fluorine is the most electronegative element on the Pauling scale (3.98), meaning it most strongly attracts electrons.' },
  // Geopolitics
  { topic:'Geopolitics', q:'The United Nations was founded in which year?', opts:['1919','1939','1945','1950'], correct:2, explanation:'The UN was founded on 24 October 1945, after World War II, to promote international peace and cooperation.' },
  { topic:'Geopolitics', q:'The North Atlantic Treaty Organisation (NATO) was founded in which city?', opts:['London','Brussels','Washington D.C.','Paris'], correct:2, explanation:'NATO was established by the North Atlantic Treaty, signed in Washington D.C. on April 4, 1949.' },
  { topic:'Geopolitics', q:'Which body of water connects the Black Sea to the Mediterranean?', opts:['Strait of Gibraltar','Suez Canal','Bosphorus and Dardanelles','Strait of Hormuz'], correct:2, explanation:'The Turkish Straits — the Bosphorus and Dardanelles — connect the Black Sea to the Aegean and Mediterranean Seas.' },
];

let activeQuizSet = [];

function pickQuizSet() {
  // Pick 5 random questions, no repeats, spread across categories
  activeQuizSet = shuffle(QUIZ_POOL).slice(0, 5);
}

function renderQuiz() {
  if (!activeQuizSet.length) pickQuizSet();
  const container = document.getElementById('quiz-cards');
  container.innerHTML = '';

  activeQuizSet.forEach((q, idx) => {
    const el = document.createElement('div');
    el.className = 'quiz-card';
    el.innerHTML = `
      <div class="quiz-num">Question ${idx + 1} of 5 · ${q.topic}</div>
      <p class="quiz-question">${q.q}</p>
      <div class="quiz-options">
        ${q.opts.map((opt, i) => `<button class="quiz-opt" onclick="answerQuiz(this,${i},${q.correct},'${q.explanation.replace(/'/g, "\\'")}',${idx})">${String.fromCharCode(65+i)}. ${opt}</button>`).join('')}
      </div>
      <p class="quiz-feedback" id="qfb-${idx}"></p>`;
    container.appendChild(el);
  });
}

function shuffleQuiz() {
  pickQuizSet();
  renderQuiz();
  document.getElementById('feed').scrollTop = 0;
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
  const discLabel = document.getElementById('home-disc-label');
  const loadingEl = document.getElementById('home-loading');

  btn.classList.add('spinning');
  container.innerHTML = '';
  discLabel.style.display = 'none';
  loadingEl.style.display = 'flex';
  loadingEl.innerHTML = '<div class="spinner"></div><p>Fetching new cards…</p>';

  localStorage.removeItem('curio_cache_home');

  try {
    await loadHomeContent();
    loadingEl.style.display = 'none';
    renderHome();
  } catch {
    // Backend asleep — show message and retry once after 35s
    loadingEl.innerHTML = '<div class="spinner"></div><p>Server waking up…<br><small>Ready in ~30 seconds</small></p>';
    setTimeout(async () => {
      try {
        await loadHomeContent();
        loadingEl.style.display = 'none';
        renderHome();
      } catch {
        // Still failed — fall back to reshuffling what we have
        loadingEl.style.display = 'none';
        state.homeCards = shuffle(state.homeCards);
        renderHome();
      }
    }, 35000);
  }

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
window.shuffleQuiz = shuffleQuiz;

document.addEventListener('DOMContentLoaded', init);
