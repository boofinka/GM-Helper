/* ── Constants & Configuration ────────────────────────────────────────────── */
const TAGS_BY_CATEGORY = {
  scenes: ["Any", "dungeon", "urban", "wilderness", "tavern", "abandoned", "eerie", "outdoor", "humorous"],
  npcs: ["Any", "merchant", "hostile", "quest giver", "informant", "mysterious", "authority", "humorous"],
  items: ["Any", "weapon", "magical", "mundane", "document", "tech", "clue", "container", "humorous"]
};

// Map of template token overrides to handle schema naming mismatches
const TOKEN_OVERRIDES = {
  name: "first_names",
  secret_hint: "secrets",
  detail: "details",
  exit: "exits",
  history: "histories",
  quirk: "quirks"
};

/* ── State Management ────────────────────────────────────────────────────── */
let activeCategory = "scenes";
let activeSetting = "any";
let activeTag = "Any";
let dataCache = {
  scenes: [],
  npcs: [],
  items: []
};

/* ── DOM Elements ────────────────────────────────────────────────────────── */
const categoryGroup = document.getElementById("category-group");
const settingGroup = document.getElementById("setting-group");
const tagGroup = document.getElementById("tag-group");

const btnGenerate = document.getElementById("btn-generate");
const btnGenerateText = document.getElementById("btn-generate-text");
const searchInput = document.getElementById("search-input");

const emptyState = document.getElementById("empty-state");
const categoryArticle = document.getElementById("category-article");
const categoryHint = document.getElementById("category-hint");
const loader = document.getElementById("loader");

const resultCard = document.getElementById("result-card");
const resultText = document.getElementById("result-text");
const resultTag = document.getElementById("result-tag");
const btnCopy = document.getElementById("btn-copy");
const toast = document.getElementById("toast");

/* ── Initialization & Data Loading ───────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  renderTags();
  await loadData();
});

async function loadData() {
  try {
    const cacheBuster = `?t=${Date.now()}`;
    const [scenesRes, npcsRes, itemsRes] = await Promise.all([
      fetch(`/src_jsons/scenes.json${cacheBuster}`).then(r => r.json()),
      fetch(`/src_jsons/npcs.json${cacheBuster}`).then(r => r.json()),
      fetch(`/src_jsons/items.json${cacheBuster}`).then(r => r.json())
    ]);

    dataCache.scenes = scenesRes.scenes || [];
    dataCache.npcs = npcsRes.npcs || [];
    dataCache.items = itemsRes.items || [];
  } catch (error) {
    console.error("Failed to load content data:", error);
    resultText.textContent = "Failed to load generator content. Please refresh the page.";
    resultCard.classList.remove("hidden");
    emptyState.classList.add("hidden");
  }
}

/* ── UI Render Functions ─────────────────────────────────────────────────── */
function renderTags() {
  tagGroup.innerHTML = "";
  const tags = TAGS_BY_CATEGORY[activeCategory] || ["Any"];

  tags.forEach(tag => {
    const button = document.createElement("button");
    const isActive = (tag === activeTag);
    button.className = `chip ${isActive ? "active" : ""}`;
    button.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
    button.dataset.tag = tag;

    button.addEventListener("click", () => {
      document.querySelectorAll("#tag-group .chip").forEach(c => c.classList.remove("active"));
      button.classList.add("active");
      activeTag = tag;
      resetDisplay();
    });

    tagGroup.appendChild(button);
  });
}

function setupEventListeners() {
  // Category Selection
  categoryGroup.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    document.querySelectorAll("#category-group .chip").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");

    activeCategory = btn.dataset.category;
    activeTag = "Any"; // Reset tag

    // Update labels and display state
    const article = (activeCategory === "npcs" || activeCategory === "items") ? "an" : "a";
    if (categoryArticle) categoryArticle.textContent = article;
    categoryHint.textContent = activeCategory.substring(0, activeCategory.length - 1);
    btnGenerateText.textContent = `Generate ${btn.textContent.substring(0, btn.textContent.length - 1)}`;

    renderTags();
    resetDisplay();
  });

  // Setting Selection
  settingGroup.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    document.querySelectorAll("#setting-group .chip").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");

    activeSetting = btn.dataset.setting;
    resetDisplay();
  });

  // Generate Click
  btnGenerate.addEventListener("click", triggerGeneration);

  // Search Enter key triggers generation
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        triggerGeneration();
      }
    });
  }

  // Copy Click
  btnCopy.addEventListener("click", copyToClipboard);
}

function resetDisplay() {
  emptyState.classList.remove("hidden");
  loader.classList.add("hidden");
  resultCard.classList.add("hidden");
}

/* ── Template Resolution Logic ───────────────────────────────────────────── */
function fillTemplate(entry) {
  let text = entry.template;
  const regex = /\{(\w+)\}/g;

  // Extract all list attributes from the entry
  const pools = {};
  Object.entries(entry).forEach(([key, val]) => {
    if (Array.isArray(val)) {
      pools[key] = val;
    }
  });

  // Match used tokens in template replacement
  const usedSelections = new Set(); // Track selected values to reduce immediate double-repeats

  text = text.replace(regex, (match, token) => {
    // Find matching list (either exact override or fuzzy match)
    let poolKey = TOKEN_OVERRIDES[token];
    if (!poolKey) {
      poolKey = Object.keys(pools).find(k =>
        k.startsWith(token) ||
        token.startsWith(k.replace(/s$/, '')) ||
        k.includes(token)
      );
    }

    const pool = pools[poolKey];
    if (pool && pool.length > 0) {
      // Prioritize picking something not already picked in this single text segment if possible
      const available = pool.filter(item => !usedSelections.has(item));
      const selectionPool = available.length > 0 ? available : pool;
      const selected = selectionPool[Math.floor(Math.random() * selectionPool.length)];

      usedSelections.add(selected);
      return selected;
    }
    return match;
  });

  // Append a random detail block if present in entry (and not already in template)
  if (pools.details && pools.details.length > 0) {
    const unusedDetails = pools.details.filter(d => !text.includes(d));
    const detailPool = unusedDetails.length > 0 ? unusedDetails : pools.details;
    const randomDetail = detailPool[Math.floor(Math.random() * detailPool.length)];
    text += " " + randomDetail;
  }

  // Capitalize sentence beginnings to correct raw JSON data formatting
  let result = text.trim();
  result = result.replace(/(^\w|[\.!\?]\s+\w)/g, match => match.toUpperCase());

  return result;
}

/* ── Generation Trigger ──────────────────────────────────────────────────── */
function triggerGeneration() {
  // Show Loader
  emptyState.classList.add("hidden");
  resultCard.classList.add("hidden");
  loader.classList.remove("hidden");
  btnGenerate.disabled = true;

  // Short delay for natural UI feel
  setTimeout(() => {
    const candidates = dataCache[activeCategory] || [];

    // Filter Candidates by Setting and Tag
    const filtered = candidates.filter(entry => {
      // 1. Tag Match
      const matchesTag = activeTag === "Any" ||
        (entry.tags && entry.tags.some(t => {
          const normalizedT = t.toLowerCase();
          const normalizedActive = activeTag.toLowerCase();
          return normalizedT === normalizedActive ||
                 (normalizedActive === "humorous" && normalizedT === "humerous") ||
                 (normalizedActive === "humerous" && normalizedT === "humorous");
        }));

      // 2. Setting Match
      const matchesSetting = activeSetting === "any" ||
        (entry.settings && entry.settings.includes(activeSetting));

      return matchesTag && matchesSetting;
    });

    // If there is a search query, rank the already-filtered candidates by simple relevance
    const query = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : "";
    let candidates = filtered;
    if (query) {
      const scored = findRelevantEntries(filtered, query);
      candidates = scored;
    }

    loader.classList.add("hidden");
    btnGenerate.disabled = false;

    if (candidates.length === 0) {
      // Show Empty / Graceful error state
      resultText.textContent = query ? "No content found for that query. Try different words." : "No content found for this combination. Try a different setting or tag.";
      resultTag.classList.add("hidden");
      resultCard.classList.remove("hidden");
      return;
    }

    // Pick random candidate & compile template
    const selectedEntry = candidates[Math.floor(Math.random() * candidates.length)];
    const generatedText = fillTemplate(selectedEntry);

    // Render results
    resultText.textContent = generatedText;
    resultTag.textContent = activeSetting.toUpperCase();
    resultTag.classList.remove("hidden");
    resultCard.classList.remove("hidden");
  }, 400);
}

/**
 * Find relevant entries by a simple token-match scoring over entry fields.
 * Returns entries sorted by descending score (highest relevance first).
 */
function findRelevantEntries(entries, query) {
  if (!query) return entries;
  const tokens = query.split(/\s+/).filter(Boolean);
  const scored = entries.map(entry => {
    // Build a searchable text blob
    let text = (entry.template || "") + " ";
    Object.entries(entry).forEach(([k, v]) => {
      if (Array.isArray(v)) text += v.join(" ") + " ";
      else if (typeof v === 'string') text += v + " ";
    });
    const low = text.toLowerCase();
    let score = 0;
    tokens.forEach(tok => {
      if (low.includes(tok)) score += (low.split(tok).length - 1) + 1;
    });
    return {entry, score};
  }).filter(s => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.entry);
}

/* ── Utilities ───────────────────────────────────────────────────────────── */
function copyToClipboard() {
  const text = resultText.textContent;
  if (!text) return;

  navigator.clipboard.writeText(text).then(() => {
    // Show Toast
    toast.classList.remove("hidden");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 2000);
  }).catch(err => {
    console.error("Failed to copy:", err);
  });
}
