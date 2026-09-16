import { DEFAULT_CITIES, workingTz, sanitizeCities, copyDefaults } from "./cities.js";
import { zoneTimeParts } from "./time.js";
import { analogIconImageData } from "./icon.js";
import { warmUrls, wikiUrlsFromPhotoMap } from "./image-cache.js";

const ALARM = "wct-tick";
const FALLBACK_ICON = {
  16: "icons/icon16.png",
  32: "icons/icon32.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png",
};

let paintGen = 0;

async function ensureAlarm() {
  const now = Date.now();
  const nextMinute = now - (now % 60000) + 60000;
  try {
    const existing = await chrome.alarms.get(ALARM);
    if (existing && typeof existing.scheduledTime === "number") {
      const wait = existing.scheduledTime - now;
      if (wait >= 0 && wait <= 61000) return;
    }
    await chrome.alarms.create(ALARM, { when: nextMinute, periodInMinutes: 1 });
  } catch (_) {
    try {
      chrome.alarms.create(ALARM, { periodInMinutes: 1 });
    } catch (__) {
      /* ignore */
    }
  }
}

async function loadState() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["cities", "selectedId", "use24Hour", "showSeconds"], (raw) => {
      const sanitized = sanitizeCities(raw.cities);
      const cities = sanitized.length ? sanitized : copyDefaults();
      let selectedId = raw.selectedId;
      if (!cities.some((c) => c.id === selectedId)) selectedId = cities[0].id;
      resolve({
        cities,
        selectedId,
        use24Hour: raw.use24Hour !== false,
        showSeconds: Boolean(raw.showSeconds),
      });
    });
  });
}

async function setDefaultIcon() {
  try {
    await chrome.action.setIcon({ path: FALLBACK_ICON });
  } catch (_) {
    /* ignore */
  }
}

async function paintIcon() {
  const gen = ++paintGen;
  try {
    const state = await loadState();
    if (gen !== paintGen) return;
    const city = state.cities.find((c) => c.id === state.selectedId) || state.cities[0];
    const tz = workingTz(city.tz);
    if (!tz) {
      await setDefaultIcon();
      await chrome.action.setTitle({ title: city.name + " · unknown time zone" });
      return;
    }
    const parts = zoneTimeParts(new Date(), tz, state.use24Hour, false);
    const image16 = await analogIconImageData(parts.hour, parts.minute, 16);
    const image32 = await analogIconImageData(parts.hour, parts.minute, 32);
    const image128 = await analogIconImageData(parts.hour, parts.minute, 128);
    if (gen !== paintGen) return;
    try {
      await chrome.action.setIcon({
        imageData: { 16: image16, 32: image32, 128: image128 },
      });
    } catch (_) {
      try {
        await chrome.action.setIcon({ imageData: image32 });
      } catch (__) {
        await setDefaultIcon();
      }
    }
    if (gen !== paintGen) return;
    await chrome.action.setTitle({
      title: parts.zone
        ? city.name + " · " + parts.time + " " + parts.zone
        : city.name + " · " + parts.time,
    });
  } catch (_) {
    if (gen === paintGen) await setDefaultIcon();
  }
}

function isPhotoMap(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function warmPhotoCache() {
  try {
    const raw = await chrome.storage.local.get("photos");
    const photos = isPhotoMap(raw.photos) ? raw.photos : {};
    await warmUrls(wikiUrlsFromPhotoMap(photos));
  } catch (_) {
    /* ignore */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["cities"], (raw) => {
    const sanitized = sanitizeCities(raw.cities);
    if (!sanitized.length) {
      chrome.storage.sync.set({
        cities: copyDefaults(),
        selectedId: DEFAULT_CITIES[0].id,
        use24Hour: true,
        showSeconds: false,
      });
    }
  });
  ensureAlarm();
  paintIcon();
  warmPhotoCache();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  paintIcon();
  warmPhotoCache();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) paintIcon();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") paintIcon();
});

ensureAlarm();
paintIcon();
