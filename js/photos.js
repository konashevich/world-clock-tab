import { ensureCached } from "./image-cache.js";

const API_UA = "WorldClockTab/1.1.0";
const CACHE_KEY = "wctWikiPhotos";
const SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const OPENSEARCH_URL =
  "https://en.wikipedia.org/w/api.php?action=opensearch&limit=8&namespace=0&format=json&origin=*&search=";
const PREFERRED_THUMB_PX = 1280;
const MIN_THUMB_WIDTH = 250;
const SUCCESS_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MISS_TTL_MS = 1000 * 60 * 60;

const TITLE_OVERRIDES = {
  "New York": "New York City",
  "Ho Chi Minh": "Ho Chi Minh City",
  "Sao Paulo": "São Paulo",
  Guatemala: "Guatemala City",
  Panama: "Panama City",
  Kuwait: "Kuwait City",
  Luxembourg: "Luxembourg City",
  Easter: "Easter Island",
  "St Johns": "St. John's, Newfoundland and Labrador",
  "St Louis": "St. Louis",
  Calcutta: "Kolkata",
  Saigon: "Ho Chi Minh City",
  Kiev: "Kyiv",
  Catamarca: "San Fernando del Valle de Catamarca",
  Godthab: "Nuuk",
  Rangoon: "Yangon",
  Ashkhabad: "Ashgabat",
  Singapore: "Singapore skyline",
};

const SKIP_TZ_PREFIXES = ["Etc/", "UTC", "GMT"];
const GENERIC_LABELS = new Set([
  "home",
  "work",
  "office",
  "local",
  "me",
  "mine",
  "here",
  "base",
  "main",
  "clock",
  "timezone",
  "time zone",
]);

const NON_PHOTO_URL_RE =
  /\/(?:Flag_of_|Coat_of_arms_|Seal_of_|Map_of_|Locator_|Logo_of_|Emblem_of_|Banner_of_|Wordmark_|SVG_|Time_Zones?_|Timezone_|Time_zone)/i;
const NON_PLACE_TITLE_RE =
  /\b(Airlines|Flight|dollar|Armed Forces|national football|F\.?C\.?|election|station|Gallery|Council|University|Airport|Time Zone|Timezone)\b/i;

let photoCache = {};
const inFlight = new Map();
let persistTimer = null;

function apiHeaders() {
  return { Accept: "application/json", "Api-User-Agent": API_UA };
}

function cityFromIana(tz) {
  if (!tz || typeof tz !== "string") return "";
  if (SKIP_TZ_PREFIXES.some((p) => tz === p || tz.startsWith(p))) return "";
  return (tz.split("/").pop() || "").replace(/_/g, " ").trim();
}

function looksLikeIana(text) {
  return /^[A-Za-z_]+(?:\/[A-Za-z0-9_\-\s]+)+$/.test(String(text || "").trim());
}

function normalizeTitle(raw) {
  return String(raw || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceLikeHeading(heading) {
  if (!heading || looksLikeIana(heading)) return false;
  if (GENERIC_LABELS.has(heading.toLowerCase())) return false;
  return heading.length >= 2;
}

export function candidateTitles(name, tz) {
  const heading = normalizeTitle(name);
  const fromTz = cityFromIana(tz);
  const titles = [];
  const push = (t) => {
    const n = normalizeTitle(t);
    if (!n) return;
    if (looksLikeIana(n) || n.includes("/")) {
      const city = cityFromIana(n.replace(/ /g, "_"));
      if (city) push(city);
      return;
    }
    const override = TITLE_OVERRIDES[n];
    if (override && !titles.includes(override)) titles.push(override);
    if (!titles.includes(n)) titles.push(n);
  };
  if (heading) {
    if (looksLikeIana(heading)) push(cityFromIana(heading));
    else if (isPlaceLikeHeading(heading)) push(heading);
  }
  push(fromTz);
  return titles;
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      chrome.storage.local.set({ [CACHE_KEY]: photoCache });
    } catch (_) {
      /* ignore */
    }
  }, 250);
}

function isNonPhotoUrl(url) {
  return !url || NON_PHOTO_URL_RE.test(url);
}

function isUsableCachedPhoto(entry) {
  return Boolean(entry && !entry.miss && entry.url && !isNonPhotoUrl(entry.url));
}

function cacheGet(key) {
  const entry = photoCache[key];
  if (!entry) return null;
  const age = Date.now() - (entry.queriedAt || 0);
  const ttl = entry.miss || !entry.url ? MISS_TTL_MS : SUCCESS_TTL_MS;
  if (age > ttl || (entry.url && isNonPhotoUrl(entry.url))) {
    delete photoCache[key];
    schedulePersist();
    return null;
  }
  return entry;
}

function cacheSet(key, value) {
  photoCache[key] = value;
  schedulePersist();
}

function cacheMiss(key) {
  cacheSet(key, { url: null, title: "", queriedAt: Date.now(), miss: true });
}

export async function loadPhotoCache() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(CACHE_KEY, (result) => {
        photoCache =
          result && result[CACHE_KEY] && typeof result[CACHE_KEY] === "object"
            ? result[CACHE_KEY]
            : {};
        resolve();
      });
    } catch (_) {
      photoCache = {};
      resolve();
    }
  });
}

function stripQuery(url) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    return parsed.toString();
  } catch (_) {
    return String(url).split("?")[0];
  }
}

function upgradeImageUrl(url) {
  if (!url) return url;
  return stripQuery(url).replace(/\/\d+px-/i, "/" + PREFERRED_THUMB_PX + "px-");
}

function candidateImageUrls(data) {
  if (!data || data.type === "disambiguation") return [];
  const thumbMeta = data.thumbnail;
  const thumb = thumbMeta && thumbMeta.source;
  const original = data.originalimage && data.originalimage.source;
  if (thumbMeta && typeof thumbMeta.width === "number" && thumbMeta.width < MIN_THUMB_WIDTH) {
    const urls = [];
    if (original && !isNonPhotoUrl(original)) urls.push(stripQuery(original));
    return urls;
  }
  const urls = [];
  const push = (u) => {
    if (!u || isNonPhotoUrl(u)) return;
    const cleaned = stripQuery(u);
    if (!urls.includes(cleaned)) urls.push(cleaned);
  };
  if (thumb) {
    push(upgradeImageUrl(thumb));
    push(stripQuery(thumb));
  }
  push(original);
  return urls;
}

async function preloadImage(url) {
  const blob = await ensureCached(url);
  return Boolean(blob && blob.size);
}

async function firstLoadableUrl(urls) {
  for (const url of urls) {
    if (await preloadImage(url)) return url;
  }
  return null;
}

async function fetchSummary(title) {
  let res;
  try {
    res = await fetch(SUMMARY_URL + encodeURIComponent(title.replace(/ /g, "_")), {
      headers: apiHeaders(),
    });
  } catch (_) {
    throw new Error("network");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("http-" + res.status);
  return res.json();
}

function isTimezoneArticle(data) {
  if (!data) return false;
  const title = data.title || "";
  const desc = data.description || "";
  if (/\btime\s*zones?\b/i.test(title)) return true;
  if (/^time zone\b/i.test(desc)) return true;
  return false;
}

async function imageFromSummary(data) {
  if (isTimezoneArticle(data)) return null;
  const urls = candidateImageUrls(data);
  if (!urls.length) return null;
  const url = await firstLoadableUrl(urls);
  if (!url) return null;
  return { url, title: data.title || "" };
}

async function searchTitles(query) {
  let res;
  try {
    res = await fetch(OPENSEARCH_URL + encodeURIComponent(query), {
      headers: apiHeaders(),
    });
  } catch (_) {
    throw new Error("network");
  }
  if (!res.ok) throw new Error("http-" + res.status);
  const data = await res.json();
  return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
}

function isUsefulSearchHit(hit, seed) {
  if (!hit || NON_PLACE_TITLE_RE.test(hit)) return false;
  const h = hit.toLowerCase();
  const s = String(seed || "").toLowerCase();
  if (!s) return true;
  return h === s || h.startsWith(s + " ") || h.includes(s);
}

async function tryTitlesForPhoto(titleList, seen) {
  let sawNetworkError = false;
  let sawDefinitiveMiss = false;
  for (const title of titleList) {
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const cached = cacheGet(title);
    if (cached) {
      if (!isUsableCachedPhoto(cached)) {
        sawDefinitiveMiss = true;
        continue;
      }
      if (await preloadImage(cached.url)) {
        return { photo: cached, definitive: true, sawNetworkError, sawDefinitiveMiss };
      }
      sawNetworkError = true;
    }
    try {
      const summary = await fetchSummary(title);
      const found = await imageFromSummary(summary);
      if (found) {
        const entry = { ...found, queriedAt: Date.now() };
        cacheSet(title, entry);
        return { photo: entry, definitive: true, sawNetworkError, sawDefinitiveMiss };
      }
      cacheMiss(title);
      sawDefinitiveMiss = true;
    } catch (_) {
      sawNetworkError = true;
    }
  }
  return { photo: null, definitive: false, sawNetworkError, sawDefinitiveMiss };
}

async function resolvePhotoForTitles(titles) {
  const seen = new Set();
  const primary = await tryTitlesForPhoto(titles, seen);
  if (primary.photo) return { photo: primary.photo, definitive: true };
  let sawNetworkError = primary.sawNetworkError;
  let sawDefinitiveMiss = primary.sawDefinitiveMiss;
  const seed = titles[0];
  if (!seed) return { photo: null, definitive: true };
  const searchKey = "search:" + seed;
  const searched = cacheGet(searchKey);
  if (searched) {
    if (!isUsableCachedPhoto(searched)) return { photo: null, definitive: true };
    if (await preloadImage(searched.url)) return { photo: searched, definitive: true };
    sawNetworkError = true;
  }
  try {
    const skylineHits = await searchTitles(seed + " skyline");
    let plainHits = [];
    try {
      plainHits = await searchTitles(seed);
    } catch (_) {
      /* optional */
    }
    const orderedHits = [...skylineHits, ...plainHits].filter((hit) =>
      isUsefulSearchHit(hit, seed)
    );
    const searchedTitles = await tryTitlesForPhoto(orderedHits, seen);
    if (searchedTitles.photo) {
      cacheSet(seed, searchedTitles.photo);
      cacheSet(searchKey, searchedTitles.photo);
      return { photo: searchedTitles.photo, definitive: true };
    }
    sawNetworkError = sawNetworkError || searchedTitles.sawNetworkError;
    sawDefinitiveMiss = sawDefinitiveMiss || searchedTitles.sawDefinitiveMiss;
    if (!sawNetworkError) {
      cacheMiss(searchKey);
      return { photo: null, definitive: true };
    }
  } catch (_) {
    return { photo: null, definitive: false };
  }
  return { photo: null, definitive: sawDefinitiveMiss && !sawNetworkError };
}

export function resolveAutoPhoto(name, tz) {
  const titles = candidateTitles(name, tz);
  if (!titles.length) return Promise.resolve({ photo: null, definitive: true });
  const key = titles.join("|");
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = resolvePhotoForTitles(titles).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export async function resizeUserPhoto(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const max = 960;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.75);
  } finally {
    if (typeof bitmap.close === "function") bitmap.close();
  }
}
