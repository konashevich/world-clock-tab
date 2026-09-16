const CACHE_NAME = "wct-wiki-images-v1";
const CACHE_PREFIX = "wct-wiki-images-";
const ALLOWED_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);
const FETCH_TIMEOUT_MS = 6000;

const inFlight = new Map();
let cacheReady = null;

export function isWikiImageUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_HOSTS.has(parsed.hostname);
  } catch (_) {
    return false;
  }
}

export function canonicalWikiUrl(url) {
  if (!isWikiImageUrl(url)) return "";
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch (_) {
    return "";
  }
}

async function dropOldCaches() {
  if (!globalThis.caches) return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name))
  );
}

async function openCache() {
  if (!globalThis.caches) return null;
  if (!cacheReady) {
    cacheReady = dropOldCaches()
      .then(() => caches.open(CACHE_NAME))
      .catch(() => {
        cacheReady = null;
        return null;
      });
  }
  return cacheReady;
}

function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, {
    credentials: "omit",
    redirect: "follow",
    signal: controller.signal,
  })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

async function loadBlob(url) {
  const key = canonicalWikiUrl(url);
  if (!key) return null;
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(key, { ignoreVary: true, ignoreSearch: true });
      if (hit && hit.ok) {
        const blob = await hit.blob();
        if (blob && blob.size) return blob;
      }
    } catch (_) {
      /* continue to fetch */
    }
  }
  const response = await fetchWithTimeout(key);
  if (!response || !response.ok) return null;
  if (cache) {
    try {
      await cache.put(key, response.clone());
    } catch (_) {
      /* quota or disk pressure; still use this response */
    }
  }
  try {
    const blob = await response.blob();
    return blob && blob.size ? blob : null;
  } catch (_) {
    return null;
  }
}

export function ensureCached(url) {
  const key = canonicalWikiUrl(url);
  if (!key) return Promise.resolve(null);
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = loadBlob(key).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export async function displayUrl(url) {
  const key = canonicalWikiUrl(url);
  if (!key) return url;
  const blob = await ensureCached(key);
  if (!blob || !blob.size) return url;
  if (typeof URL.createObjectURL !== "function") return url;
  return URL.createObjectURL(blob);
}

export async function warmUrls(urls) {
  const unique = [];
  for (const url of urls || []) {
    const key = canonicalWikiUrl(url);
    if (key && !unique.includes(key)) unique.push(key);
  }
  await Promise.all(unique.map((key) => ensureCached(key)));
}

export async function forgetUrl(url) {
  const key = canonicalWikiUrl(url);
  if (!key) return;
  const cache = await openCache();
  if (!cache) return;
  try {
    await cache.delete(key, { ignoreVary: true, ignoreSearch: true });
  } catch (_) {
    /* ignore */
  }
}

export function wikiUrlsFromPhotoMap(photos) {
  const urls = [];
  for (const rec of Object.values(photos || {})) {
    if (!rec || typeof rec !== "object") continue;
    const url =
      rec.source === "auto" && rec.url
        ? rec.url
        : rec.source === "user" && rec.wikiUrl
          ? rec.wikiUrl
          : "";
    const key = canonicalWikiUrl(url);
    if (key && !urls.includes(key)) urls.push(key);
  }
  return urls;
}

export async function pruneToUrls(keepUrls, options) {
  const keep = new Set();
  for (const url of keepUrls || []) {
    const key = canonicalWikiUrl(url);
    if (key) keep.add(key);
  }
  if (!keep.size && !(options && options.allowEmptyWipe)) return;
  const cache = await openCache();
  if (!cache) return;
  let keys;
  try {
    keys = await cache.keys();
  } catch (_) {
    return;
  }
  await Promise.all(
    keys.map(async (request) => {
      const stored = canonicalWikiUrl(request.url);
      if (!stored || keep.has(stored)) return;
      try {
        await cache.delete(request);
      } catch (_) {
        /* ignore */
      }
    })
  );
}
