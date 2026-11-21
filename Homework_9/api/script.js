// DOM References
const pokeballUnit = document.getElementById('pokeball-unit');
const pokeballBtn = document.getElementById('pokeball-btn');
const transferBeam = document.getElementById('transfer-beam');

// Search & Filter Elements (Bonus 2)
const searchForm = document.getElementById('search-form');
const pokeSearchInput = document.getElementById('poke-search');
const searchNotice = document.getElementById('search-notice');
const presetChips = document.querySelectorAll('.preset-chip');

// View Containers
const idleView = document.getElementById('idle-view');
const loadingView = document.getElementById('loading-view');
const errorView = document.getElementById('error-view');
const dossierView = document.getElementById('dossier-view');

// Action Buttons
const scanBtn = document.getElementById('scan-btn');
const rescanBtn = document.getElementById('rescan-btn');
const retryBtn = document.getElementById('retry-btn');
const errorMessageText = document.getElementById('error-message-text');

// Dossier Specimen Elements
const specimenDossier = document.getElementById('specimen-dossier');
const pokemonName = document.getElementById('pokemon-name');
const pokemonId = document.getElementById('pokemon-id');
const pokemonImg = document.getElementById('pokemon-img');
const pokemonTypes = document.getElementById('pokemon-types');
const pokemonHeight = document.getElementById('pokemon-height');
const pokemonWeight = document.getElementById('pokemon-weight');
const pokemonExp = document.getElementById('pokemon-exp');

// Bonus 1: Cache Indicator Badge
const cacheBadge = document.getElementById('cache-badge');

// Bonus 3: Second Free API Speech Bubble Element (Trainer Wisdom)
const trainerWisdomText = document.getElementById('trainer-wisdom');

// Stat Diagnostic Fills & Numbers
const statHp = document.getElementById('stat-hp');
const statAttack = document.getElementById('stat-attack');
const statDefense = document.getElementById('stat-defense');
const statSpeed = document.getElementById('stat-speed');
const valHp = document.getElementById('val-hp');
const valAttack = document.getElementById('val-attack');
const valDefense = document.getElementById('val-defense');
const valSpeed = document.getElementById('val-speed');

// Last queried parameter to support instant retry
let lastAttemptedQuery = null;

// Type Colors Mapping
const TYPE_COLORS = {
  fire: '#f97316',
  water: '#38bdf8',
  grass: '#4ade80',
  electric: '#facc15',
  ice: '#67e8f9',
  fighting: '#dc2626',
  poison: '#c084fc',
  ground: '#fbbf24',
  flying: '#a5b4fc',
  psychic: '#f472b6',
  bug: '#a3e635',
  rock: '#d97706',
  ghost: '#818cf8',
  dragon: '#6366f1',
  steel: '#94a3b8',
  fairy: '#fbcfe8',
  normal: '#cbd5e1',
  dark: '#475569'
};

// Fallback Trainer Wisdom Quotes in case client runs purely offline
const FALLBACK_WISDOMS = [
  "A true trainer never backs down from an unknown challenge!",
  "Every battle teaches something new, win or lose.",
  "Patience and strategy can overcome raw power every single time.",
  "Treat your Pokémon with trust, and their true strength will awaken.",
  "The journey through the gym circuit begins with a single step."
];

// Helper: Show Search Notice Banner
function showSearchNotice(msg) {
  if (!msg) {
    searchNotice.textContent = '';
    searchNotice.classList.add('hidden');
    return;
  }
  searchNotice.textContent = msg;
  searchNotice.classList.remove('hidden');
}

// State View Controller
function setViewState(state) {
  idleView.classList.add('hidden');
  loadingView.classList.add('hidden');
  errorView.classList.add('hidden');
  dossierView.classList.add('hidden');

  pokeballUnit.classList.remove('shaking', 'open-state', 'error-glow');
  transferBeam.classList.add('hidden');

  switch (state) {
    case 'idle':
      idleView.classList.remove('hidden');
      break;

    case 'loading':
      loadingView.classList.remove('hidden');
      pokeballUnit.classList.add('shaking');
      transferBeam.classList.remove('hidden');
      break;

    case 'dossier':
      dossierView.classList.remove('hidden');
      pokeballUnit.classList.add('open-state');
      transferBeam.classList.remove('hidden');
      break;

    case 'error':
      errorView.classList.remove('hidden');
      pokeballUnit.classList.add('error-glow');
      break;
  }
}

// Fetch Logic (Backend proxy + TTL caching + fallback handling)
async function initiateScan(targetQuery = null) {
  showSearchNotice(null);

  // If no target query specified, pick random Pokemon (ID 1-1025)
  const query = targetQuery ? String(targetQuery).trim().toLowerCase() : String(Math.floor(Math.random() * 1025) + 1);
  lastAttemptedQuery = query;

  setViewState('loading');

  const proxyUrl = `/api/pokemon/${encodeURIComponent(query)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7500);

    const response = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    // Specific 404 handler for search typos
    if (response.status === 404) {
      const errData = await response.json();
      setViewState('idle');
      showSearchNotice(errData.error || `Specimen '${query}' not found. Check spelling or try an ID from 1-1025!`);
      return;
    }

    if (!response.ok) {
      throw new Error(`Proxy error code: ${response.status}`);
    }

    const data = await response.json();
    displaySpecimen(data);
  } catch (proxyErr) {
    console.warn('Backend proxy unavailable, falling back to direct PokeAPI + AdviceSlip:', proxyErr);

    try {
      const fallbackUrl = `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(query)}`;
      const fbController = new AbortController();
      const fbTimeout = setTimeout(() => fbController.abort(), 7500);

      const fbResponse = await fetch(fallbackUrl, { signal: fbController.signal });
      clearTimeout(fbTimeout);

      if (fbResponse.status === 404) {
        setViewState('idle');
        showSearchNotice(`Specimen '${query}' not found. Check spelling or try an ID from 1-1025!`);
        return;
      }

      if (!fbResponse.ok) {
        throw new Error(`PokeAPI status: ${fbResponse.status}`);
      }

      const raw = await fbResponse.json();

      // Bonus 3: Direct Client-Side Advice Slip API Fetch with Fallback
      let clientWisdom = FALLBACK_WISDOMS[raw.id % FALLBACK_WISDOMS.length];
      try {
        const adviceResp = await fetch('https://api.adviceslip.com/advice');
        if (adviceResp.ok) {
          const advJson = await adviceResp.json();
          if (advJson?.slip?.advice) {
            clientWisdom = advJson.slip.advice;
          }
        }
      } catch (advErr) {
        // Fallback remains active
      }

      const mappedData = {
        id: raw.id,
        name: raw.name,
        sprite: raw.sprites?.other?.['official-artwork']?.front_default || raw.sprites?.front_default,
        types: raw.types.map(t => t.type.name),
        stats: {
          hp: raw.stats.find(s => s.stat.name === 'hp')?.base_stat || 0,
          attack: raw.stats.find(s => s.stat.name === 'attack')?.base_stat || 0,
          defense: raw.stats.find(s => s.stat.name === 'defense')?.base_stat || 0,
          speed: raw.stats.find(s => s.stat.name === 'speed')?.base_stat || 0
        },
        height: raw.height,
        weight: raw.weight,
        base_experience: raw.base_experience,
        wisdom: clientWisdom,
        cached: false
      };

      displaySpecimen(mappedData);
    } catch (finalErr) {
      console.error('Specimen acquisition failed:', finalErr);
      errorMessageText.textContent = "Signal Lost: Unable to connect to the Pokéball transfer network. Please check your connection and try again!";
      setViewState('error');
    }
  }
}

// Render Specimen Dossier Data
function displaySpecimen(data) {
  // Specimen Title & ID
  pokemonName.textContent = data.name;
  pokemonId.textContent = `#${String(data.id).padStart(4, '0')}`;

  // Bonus 1: Cache Badge Indicator
  if (data.cached) {
    cacheBadge.textContent = '⚡ CACHED';
    cacheBadge.className = 'cache-badge cached';
  } else {
    cacheBadge.textContent = 'LIVE STREAM';
    cacheBadge.className = 'cache-badge live';
  }

  // Bonus 3: Render Trainer Wisdom from Second Free API
  trainerWisdomText.textContent = `“${data.wisdom || FALLBACK_WISDOMS[0]}”`;

  // Elemental Type Accent & Badges
  const primaryType = Array.isArray(data.types) && data.types.length > 0 ? data.types[0] : 'normal';
  const typeAccent = TYPE_COLORS[primaryType] || 'var(--accent-cyan)';
  specimenDossier.style.setProperty('--specimen-accent', typeAccent);

  pokemonTypes.innerHTML = '';
  const typesList = Array.isArray(data.types) ? data.types : [];
  typesList.forEach(typeName => {
    const pill = document.createElement('span');
    pill.className = `type-pill type-${typeName}`;
    pill.textContent = typeName;
    pokemonTypes.appendChild(pill);
  });

  // Sprite with emergence animation
  pokemonImg.classList.remove('emerging');
  const artwork = data.sprite || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png';
  pokemonImg.src = artwork;
  pokemonImg.alt = data.name;
  void pokemonImg.offsetWidth; // Reflow
  pokemonImg.classList.add('emerging');

  // Biometrics (decimeters -> meters, hectograms -> kg)
  pokemonHeight.textContent = data.height ? `${(data.height / 10).toFixed(1)} m` : '-- m';
  pokemonWeight.textContent = data.weight ? `${(data.weight / 10).toFixed(1)} kg` : '-- kg';
  pokemonExp.textContent = data.base_experience ?? 'N/A';

  // Stats calculation
  const stats = data.stats || {};
  const hp = stats.hp || 0;
  const atk = stats.attack || 0;
  const def = stats.defense || 0;
  const spd = stats.speed || 0;

  valHp.textContent = hp;
  valAttack.textContent = atk;
  valDefense.textContent = def;
  valSpeed.textContent = spd;

  // Animate stat bars smoothly
  statHp.style.width = '0%';
  statAttack.style.width = '0%';
  statDefense.style.width = '0%';
  statSpeed.style.width = '0%';

  requestAnimationFrame(() => {
    setTimeout(() => {
      statHp.style.width = `${Math.min(100, Math.round((hp / 200) * 100))}%`;
      statAttack.style.width = `${Math.min(100, Math.round((atk / 200) * 100))}%`;
      statDefense.style.width = `${Math.min(100, Math.round((def / 200) * 100))}%`;
      statSpeed.style.width = `${Math.min(100, Math.round((spd / 200) * 100))}%`;
    }, 80);
  });

  setViewState('dossier');
}

// Reset Ball & Return to Idle State
function resetScanner() {
  showSearchNotice(null);
  pokeSearchInput.value = '';
  setViewState('idle');
}

// Event Listeners
scanBtn.addEventListener('click', () => initiateScan());
pokeballBtn.addEventListener('click', () => {
  if (!loadingView.classList.contains('hidden')) return;
  initiateScan();
});
rescanBtn.addEventListener('click', () => resetScanner());
retryBtn.addEventListener('click', () => initiateScan(lastAttemptedQuery));

// Bonus 2: Search Form Handler
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const rawVal = pokeSearchInput.value.trim();
  if (!rawVal) {
    showSearchNotice('Please enter a Pokémon name or Pokédex ID (1–1025).');
    return;
  }
  initiateScan(rawVal);
});

// Bonus 2: Quick-Filter Preset Chips
presetChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const q = chip.getAttribute('data-query');
    pokeSearchInput.value = q;
    initiateScan(q);
  });
});

// Initialize in Idle State
setViewState('idle');
