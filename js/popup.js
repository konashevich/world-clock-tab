import {
  DEFAULT_CITIES,
  MAX_CITIES,
  resolveZone,
  newCityId,
  canAddCity,
  canRemove,
  moveCity,
  workingTz,
  sanitizeCities,
  copyDefaults,
} from "./cities.js";
import { zoneTimeParts } from "./time.js";
import { loadPhotoCache, resolveAutoPhoto, resizeUserPhoto } from "./photos.js";
import { canonicalWikiUrl, displayUrl, forgetUrl, pruneToUrls, wikiUrlsFromPhotoMap } from "./image-cache.js";

const isHomeTab = document.documentElement.classList.contains("newtab");
const isExtensionPanel = !isHomeTab;
const listEl = document.getElementById("cityList");
const gearBtn = document.getElementById("gearBtn");
const addBtn = document.getElementById("addBtn");
const settingsPanel = document.getElementById("settingsPanel");
const addPanel = document.getElementById("addPanel");
const use24HourEl = document.getElementById("use24Hour");
const showSecondsEl = document.getElementById("showSeconds");
const settingsDone = document.getElementById("settingsDone");
const cityInput = document.getElementById("cityInput");
const nameInput = document.getElementById("nameInput");
const tzHint = document.getElementById("tzHint");
const addCancel = document.getElementById("addCancel");
const addConfirm = document.getElementById("addConfirm");
const photoFile = document.getElementById("photoFile");

let state = {
  cities: copyDefaults(),
  selectedId: DEFAULT_CITIES[0].id,
  use24Hour: true,
  showSeconds: false,
};
let photos = {};
const slotBlobs = new Map();
const applySeq = new Map();
let pendingPhotoId = null;
let resolvedAdd = null;
let tickTimer = null;
let storageWasEmpty = false;
let applyingRemote = false;
let pendingStateWrites = 0;
let pendingPhotoWrites = 0;
let photoWriteChain = Promise.resolve();
let listGen = 0;
let panningId = null;
let panDrag = null;
let panDragSeq = 0;
let skippedPhotoRefresh = false;
const imageSizeCache = new Map();

function hasChromeStorage() {
  return Boolean(globalThis.chrome && chrome.storage && chrome.storage.sync);
}

function loadState() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["cities", "selectedId", "use24Hour", "showSeconds"], (raw) => {
      const sanitized = sanitizeCities(raw.cities);
      storageWasEmpty = !sanitized.length;
      const cities = sanitized.length ? sanitized : copyDefaults();
      let selectedId = raw.selectedId;
      if (!cities.some((c) => c.id === selectedId)) selectedId = cities[0].id;
      state = {
        cities,
        selectedId,
        use24Hour: raw.use24Hour !== false,
        showSeconds: Boolean(raw.showSeconds),
      };
      const storedDump = JSON.stringify(Array.isArray(raw.cities) ? raw.cities : []);
      if (JSON.stringify(cities) !== storedDump) storageWasEmpty = true;
      if (raw.selectedId !== selectedId) storageWasEmpty = true;
      resolve();
    });
  });
}

function isPhotoMap(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function loadPhotos() {
  return new Promise((resolve) => {
    chrome.storage.local.get("photos", (raw) => {
      photos = isPhotoMap(raw.photos) ? { ...raw.photos } : {};
      resolve();
    });
  });
}

function saveState() {
  if (!hasChromeStorage() || applyingRemote) return;
  pendingStateWrites += 1;
  chrome.storage.sync.set(
    {
      cities: state.cities,
      selectedId: state.selectedId,
      use24Hour: state.use24Hour,
      showSeconds: state.showSeconds,
    },
    () => {
      pendingStateWrites = Math.max(0, pendingStateWrites - 1);
    }
  );
}

function wikiUrlFromRec(rec) {
  return rec && rec.source === "auto" && rec.url ? rec.url : null;
}

function rememberedWikiUrl(rec) {
  if (!rec) return null;
  return wikiUrlFromRec(rec) || (rec.source === "user" && rec.wikiUrl) || null;
}

function clampPct(n, fallback) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
}

function readPos(raw) {
  if (!raw || typeof raw !== "object") return { x: 50, y: 50 };
  return { x: clampPct(raw.x, 50), y: clampPct(raw.y, 50) };
}

function isCenterPos(pos) {
  const p = readPos(pos);
  return p.x === 50 && p.y === 50;
}

function posCss(pos) {
  const p = readPos(pos);
  if (isCenterPos(p)) return "center";
  return p.x + "% " + p.y + "%";
}

function posFromCss(css, fallback) {
  const t = String(css || "").trim().toLowerCase();
  if (!t) return readPos(fallback);
  if (t === "center" || t === "center center") return { x: 50, y: 50 };
  const parts = t.split(/\s+/);
  if (parts.length >= 2) {
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x: clampPct(x, 50), y: clampPct(y, 50) };
  }
  return readPos(fallback);
}

function attachPos(toStore, rec, previous) {
  if (!toStore) return toStore;
  if (rec && Object.prototype.hasOwnProperty.call(rec, "pos")) {
    if (rec.pos == null || isCenterPos(rec.pos)) delete toStore.pos;
    else toStore.pos = readPos(rec.pos);
    return toStore;
  }
  if (previous && previous.pos && !isCenterPos(previous.pos)) toStore.pos = readPos(previous.pos);
  else delete toStore.pos;
  return toStore;
}

function beginPhotoWrite() {
  pendingPhotoWrites += 1;
}

function finishPhotoWrite() {
  pendingPhotoWrites = Math.max(0, pendingPhotoWrites - 1);
}

function prunePhotos() {
  const ids = new Set(state.cities.map((city) => city.id));
  const dropped = [];
  let changed = false;
  for (const id of Object.keys(photos)) {
    if (!ids.has(id)) {
      const url = rememberedWikiUrl(photos[id]);
      if (url) dropped.push(url);
      delete photos[id];
      changed = true;
    }
  }
  if (changed && hasChromeStorage()) {
    beginPhotoWrite();
    chrome.storage.local.set({ photos }, () => finishPhotoWrite());
  }
  const kept = wikiUrlsFromPhotoMap(photos);
  for (const url of dropped) {
    if (!kept.includes(canonicalWikiUrl(url))) forgetUrl(url);
  }
  pruneToUrls(kept, {
    allowEmptyWipe: Object.keys(photos).length > 0 && !kept.length,
  });
}

function refreshAddButton() {
  if (!addBtn) return;
  const full = state.cities.length >= MAX_CITIES;
  addBtn.title = full ? "The list is full (8 cities)." : "Add city";
}

function mergePhotoRecord(id, rec) {
  const run = () => mergePhotoRecordNow(id, rec);
  const next = photoWriteChain.then(run, run);
  photoWriteChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function mergePhotoRecordNow(id, rec) {
  return new Promise((resolve) => {
    if (rec && rec.source === "auto" && photos[id] && photos[id].source === "user") {
      resolve(false);
      return;
    }
    chrome.storage.local.get("photos", (raw) => {
      const stored = isPhotoMap(raw.photos) ? raw.photos : {};
      const next = { ...stored, ...photos };
      if (
        rec &&
        rec.source === "auto" &&
        next[id] &&
        next[id].source === "user" &&
        photos[id] &&
        photos[id].source === "user"
      ) {
        photos[id] = next[id];
        resolve(false);
        return;
      }
      const previous = next[id] || stored[id];
      const previousUrl = rememberedWikiUrl(previous);
      let toStore = rec;
      if (rec && rec.source === "user") {
        toStore = {
          source: "user",
          url: rec.url,
          wikiUrl: rec.wikiUrl || previousUrl || undefined,
        };
        if (!toStore.wikiUrl) delete toStore.wikiUrl;
      } else if (rec) {
        toStore = { source: rec.source, url: rec.url };
      }
      if (toStore) attachPos(toStore, rec, previous);
      if (toStore === null) {
        delete next[id];
        delete photos[id];
      } else {
        next[id] = toStore;
        photos[id] = toStore;
      }
      beginPhotoWrite();
      chrome.storage.local.set({ photos: next }, () => {
        finishPhotoWrite();
        if (chrome.runtime.lastError) {
          if (stored[id]) photos[id] = stored[id];
          else delete photos[id];
          resolve(false);
          return;
        }
        const kept = wikiUrlsFromPhotoMap(next);
        if (previousUrl && !kept.includes(canonicalWikiUrl(previousUrl))) forgetUrl(previousUrl);
        resolve(true);
      });
    });
  });
}

function photoFor(city) {
  return photos[city.id] || null;
}

function slotSelector(id) {
  return '.slot[data-id="' + CSS.escape(id) + '"]';
}

function revokeSlotBlob(id) {
  const blobUrl = slotBlobs.get(id);
  if (!blobUrl) return;
  URL.revokeObjectURL(blobUrl);
  slotBlobs.delete(id);
}

function revokeAllSlotBlobs() {
  for (const blobUrl of slotBlobs.values()) {
    URL.revokeObjectURL(blobUrl);
  }
  slotBlobs.clear();
}

function paintSlotBackground(slot, url, title, pos) {
  const id = slot.dataset.id;
  const keepPan = panningId === id && slot.classList.contains("panning");
  const livePos = slot.style.backgroundPosition;
  slot.style.backgroundImage = url ? "url(" + JSON.stringify(url) + ")" : "";
  slot.style.backgroundPosition = keepPan && livePos ? livePos : url ? posCss(pos) : "";
  slot.title = title || "";
  const panBtn = slot.querySelector(".pan-btn");
  if (panBtn) panBtn.disabled = !url;
  if (!url && panningId === id) exitPanMode();
}

function imageUrlFromSlot(slot) {
  const bg = slot.style.backgroundImage;
  if (!bg || bg === "none") return "";
  const inner = bg.replace(/^url\(/, "").replace(/\)$/, "");
  try {
    return JSON.parse(inner);
  } catch (_) {
    return inner.replace(/^["']|["']$/g, "");
  }
}

function loadImageSize(url, cacheKey) {
  if (!url) return Promise.resolve(null);
  const key = cacheKey || url;
  if (imageSizeCache.has(key)) return Promise.resolve(imageSizeCache.get(key));
  if (key !== url && imageSizeCache.has(url)) return Promise.resolve(imageSizeCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = { w: img.naturalWidth, h: img.naturalHeight };
      if (size.w && size.h) {
        imageSizeCache.set(key, size);
        if (key !== url) imageSizeCache.set(url, size);
      }
      resolve(size.w ? size : null);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function coverOverflow(slotW, slotH, imgW, imgH) {
  if (!imgW || !imgH || !slotW || !slotH) return { ox: 0, oy: 0 };
  const scale = Math.max(slotW / imgW, slotH / imgH);
  return {
    ox: Math.max(0, imgW * scale - slotW),
    oy: Math.max(0, imgH * scale - slotH),
  };
}

function fallbackOverflow(slotW, slotH) {
  const w = Math.max(slotW, 1);
  const h = Math.max(slotH, 1);
  if (h >= w) return { ox: w, oy: 0 };
  return { ox: 0, oy: h };
}

function applyPanDrag(slot, drag) {
  if (!slot) return;
  const dx = drag.lastX - drag.startX;
  const dy = drag.lastY - drag.startY;
  const x = drag.ox > 1 ? clampPct(drag.startPos.x - (dx / drag.ox) * 100, drag.startPos.x) : drag.startPos.x;
  const y = drag.oy > 1 ? clampPct(drag.startPos.y - (dy / drag.oy) * 100, drag.startPos.y) : drag.startPos.y;
  drag.current = { x, y };
  slot.style.backgroundPosition = posCss(drag.current);
}

function releaseDragPointer(drag) {
  const slot = listEl.querySelector(slotSelector(drag.id));
  if (!slot) return;
  try {
    slot.releasePointerCapture(drag.pointerId);
  } catch (_) {
    /* ignore */
  }
  slot.classList.remove("dragging");
}

function finishActiveDrag(save) {
  if (!panDrag) return;
  const drag = panDrag;
  panDrag = null;
  releaseDragPointer(drag);
  if (save !== false && drag.current) savePhotoPos(drag.id, drag.current);
}

function setPanButtonState(slot, on) {
  const panBtn = slot && slot.querySelector(".pan-btn");
  if (!panBtn) return;
  panBtn.classList.toggle("active", on);
  panBtn.setAttribute("aria-pressed", on ? "true" : "false");
}

function exitPanMode() {
  finishActiveDrag(true);
  if (!panningId) {
    flushSkippedPhotoRefresh();
    return;
  }
  const slot = listEl.querySelector(slotSelector(panningId));
  if (slot) {
    slot.classList.remove("panning", "dragging");
    setPanButtonState(slot, false);
    const resetBtn = slot.querySelector(".reset-pos-btn");
    if (resetBtn) resetBtn.hidden = true;
  }
  panningId = null;
  flushSkippedPhotoRefresh();
}

function stopPanForCity(id) {
  if (panDrag && panDrag.id === id) finishActiveDrag(false);
  if (panningId === id) exitPanMode();
}

function flushSkippedPhotoRefresh() {
  if (!skippedPhotoRefresh) return;
  if (panningId || panDrag) return;
  skippedPhotoRefresh = false;
  photoWriteChain.then(() => {
    if (panningId || panDrag) {
      skippedPhotoRefresh = true;
      return;
    }
    refreshFromStorage();
  });
}

function enterPanMode(id) {
  if (panningId === id) {
    exitPanMode();
    return;
  }
  exitPanMode();
  const rec = photos[id];
  if (!rec || !rec.url) return;
  const slot = listEl.querySelector(slotSelector(id));
  if (!slot || !imageUrlFromSlot(slot)) return;
  panningId = id;
  slot.classList.add("panning");
  setPanButtonState(slot, true);
  const resetBtn = slot.querySelector(".reset-pos-btn");
  if (resetBtn) resetBtn.hidden = false;
}

function savePhotoPos(id, pos) {
  const rec = photos[id];
  if (!rec || !rec.url) return;
  const next = { source: rec.source, url: rec.url, pos: isCenterPos(pos) ? null : readPos(pos) };
  if (rec.source === "user" && rec.wikiUrl) next.wikiUrl = rec.wikiUrl;
  mergePhotoRecord(id, next);
}

function resetPhotoPos(id) {
  finishActiveDrag(false);
  const rec = photos[id];
  if (!rec || !rec.url) return;
  const slot = listEl.querySelector(slotSelector(id));
  if (slot) slot.style.backgroundPosition = "center";
  const next = { source: rec.source, url: rec.url, pos: null };
  if (rec.source === "user" && rec.wikiUrl) next.wikiUrl = rec.wikiUrl;
  mergePhotoRecord(id, next);
  exitPanMode();
}

function startPanDrag(slot, id, ev) {
  const rec = photos[id];
  if (!rec || !rec.url) return;
  const seq = ++panDragSeq;
  const rect = slot.getBoundingClientRect();
  const display = imageUrlFromSlot(slot);
  const sizeKey = rec.url || display;
  const cached = imageSizeCache.get(sizeKey) || imageSizeCache.get(display);
  const overflow = cached
    ? coverOverflow(rect.width, rect.height, cached.w, cached.h)
    : fallbackOverflow(rect.width, rect.height);
  panDrag = {
    seq,
    id,
    pointerId: ev.pointerId,
    startX: ev.clientX,
    startY: ev.clientY,
    lastX: ev.clientX,
    lastY: ev.clientY,
    startPos: posFromCss(slot.style.backgroundPosition, rec.pos),
    ox: overflow.ox,
    oy: overflow.oy,
    ready: true,
  };
  slot.classList.add("dragging");
  try {
    slot.setPointerCapture(ev.pointerId);
  } catch (_) {
    /* ignore */
  }
  if (cached) return;
  loadImageSize(display, sizeKey).then((size) => {
    if (!panDrag || panDrag.seq !== seq) return;
    if (size) {
      const next = coverOverflow(rect.width, rect.height, size.w, size.h);
      panDrag.ox = next.ox;
      panDrag.oy = next.oy;
    }
    applyPanDrag(slot, panDrag);
  });
}

function movePanDrag(slot, ev) {
  if (!panDrag || !slot || panDrag.id !== slot.dataset.id) return;
  if (ev.pointerId !== panDrag.pointerId) return;
  panDrag.lastX = ev.clientX;
  panDrag.lastY = ev.clientY;
  if (!panDrag.ready) return;
  applyPanDrag(slot, panDrag);
}

function endPanDrag(slot, ev) {
  if (!panDrag) return;
  if (slot && panDrag.id !== slot.dataset.id) return;
  if (ev && ev.pointerId !== panDrag.pointerId) return;
  finishActiveDrag(true);
}

function panChromeTarget(target) {
  return Boolean(
    target && target.closest && target.closest(".slot-actions, .reorder-btn, .toolbar-clock-badge")
  );
}

async function applyPhotoToSlot(slot, rec) {
  if (!slot) return;
  const id = slot.dataset.id;
  const gen = listGen;
  const seq = (applySeq.get(id) || 0) + 1;
  applySeq.set(id, seq);
  const stillCurrent = () =>
    listGen === gen && applySeq.get(id) === seq && slot.dataset.id === id;
  const dropDisplay = (display) => {
    if (typeof display === "string" && display.startsWith("blob:")) URL.revokeObjectURL(display);
  };
  try {
    if (!rec || !rec.url) {
      if (!stillCurrent()) return;
      revokeSlotBlob(id);
      paintSlotBackground(slot, "", "");
      return;
    }
    if (rec.source === "user") {
      if (!stillCurrent()) return;
      revokeSlotBlob(id);
      paintSlotBackground(slot, rec.url, "Your photo", rec.pos || (photos[id] && photos[id].pos));
      return;
    }
    const display = await displayUrl(rec.url);
    if (!stillCurrent()) {
      dropDisplay(display);
      return;
    }
    const current = photos[id];
    if (!current || current.source !== "auto" || current.url !== rec.url) {
      dropDisplay(display);
      return;
    }
    revokeSlotBlob(id);
    if (typeof display === "string" && display.startsWith("blob:")) slotBlobs.set(id, display);
    paintSlotBackground(slot, display, "Photo: Wikipedia", current.pos);
  } catch (_) {
    if (!stillCurrent()) return;
    if (
      rec &&
      rec.source === "auto" &&
      rec.url &&
      photos[id] &&
      photos[id].source === "auto" &&
      photos[id].url === rec.url
    ) {
      revokeSlotBlob(id);
      paintSlotBackground(slot, rec.url, "Photo: Wikipedia", photos[id].pos);
    }
  }
}

function paintTimes() {
  const now = new Date();
  listEl.querySelectorAll(".slot").forEach((slot) => {
    const id = slot.dataset.id;
    const city = state.cities.find((c) => c.id === id);
    if (!city) return;
    const tz = workingTz(city.tz);
    const timeEl = slot.querySelector(".time");
    const zoneEl = slot.querySelector(".zone");
    const dateEl = slot.querySelector(".date");
    if (!tz) {
      timeEl.textContent = "—";
      if (zoneEl) zoneEl.textContent = "";
      dateEl.textContent = "Unknown time zone";
      return;
    }
    const parts = zoneTimeParts(now, tz, state.use24Hour, state.showSeconds);
    timeEl.textContent = parts.time;
    if (zoneEl) zoneEl.textContent = parts.zone || "";
    dateEl.textContent = parts.dateText;
  });
}

function markSelected() {
  listEl.querySelectorAll(".slot").forEach((slot) => {
    const on = slot.dataset.id === state.selectedId;
    slot.classList.toggle("selected", on);
    const badge = slot.querySelector(".toolbar-clock-badge");
    if (badge) badge.hidden = !on;
  });
}

function selectCity(id) {
  if (state.selectedId === id) return;
  state.selectedId = id;
  saveState();
  markSelected();
}

function fetchAutoPhoto(city) {
  if (!state.cities.some((c) => c.id === city.id)) return;
  const rec = photos[city.id];
  if (rec && rec.source === "user") return;
  if (rec && rec.source === "auto" && rec.url) return;
  resolveAutoPhoto(city.name, city.tz)
    .then(({ photo }) => {
      if (!photo || !photo.url) return;
      if (!state.cities.some((c) => c.id === city.id)) return;
      return mergePhotoRecord(city.id, { source: "auto", url: photo.url }).then((wrote) => {
        if (!wrote) return;
        if (!state.cities.some((c) => c.id === city.id)) return;
        const live = listEl.querySelector(slotSelector(city.id));
        applyPhotoToSlot(live, photos[city.id]);
      });
    })
    .catch(() => {});
}

function restoreWikipediaPhoto(city) {
  stopPanForCity(city.id);
  const remembered = rememberedWikiUrl(photos[city.id]);
  const cityRef = city;
  const run = () => {
    if (!state.cities.some((c) => c.id === cityRef.id)) return Promise.resolve(false);
    delete photos[cityRef.id];
    const live = listEl.querySelector(slotSelector(cityRef.id));
    applyPhotoToSlot(live, null);
    const btn = live && live.querySelector(".photo-btn");
    if (btn) btn.title = "Use my photo";
    if (remembered) {
      return mergePhotoRecordNow(cityRef.id, {
        source: "auto",
        url: remembered,
        pos: null,
      }).then((wrote) => {
        if (!wrote) {
          fetchAutoPhoto(cityRef);
          return false;
        }
        const slot = listEl.querySelector(slotSelector(cityRef.id));
        applyPhotoToSlot(slot, photos[cityRef.id]);
        return true;
      });
    }
    return mergePhotoRecordNow(cityRef.id, null).then(() => {
      fetchAutoPhoto(cityRef);
      return true;
    });
  };
  const next = photoWriteChain.then(run, run);
  photoWriteChain = next.then(
    () => undefined,
    () => undefined
  );
}

function syncReorderControls() {
  if (!isExtensionPanel) return;
  const total = state.cities.length;
  listEl.querySelectorAll(".slot").forEach((slot) => {
    const index = state.cities.findIndex((c) => c.id === slot.dataset.id);
    const leftBtn = slot.querySelector(".reorder-left");
    const rightBtn = slot.querySelector(".reorder-right");
    if (!leftBtn || !rightBtn) return;
    const show = total >= 2 && index >= 0;
    leftBtn.hidden = !show || index <= 0;
    rightBtn.hidden = !show || index >= total - 1;
  });
}

function applyCityOrderToDom() {
  for (const city of state.cities) {
    const slot = listEl.querySelector(slotSelector(city.id));
    if (slot) listEl.appendChild(slot);
  }
  syncReorderControls();
}

function shiftCity(id, delta) {
  const next = moveCity(state.cities, id, delta);
  if (next === state.cities) return;
  state.cities = next;
  saveState();
  applyCityOrderToDom();
}

function renderList() {
  exitPanMode();
  listGen += 1;
  document.documentElement.style.setProperty(
    "--city-count",
    String(Math.max(1, state.cities.length))
  );
  revokeAllSlotBlobs();
  listEl.innerHTML = "";
  for (const [cityIndex, city] of state.cities.entries()) {
    const slot = document.createElement("article");
    slot.className = "slot" + (city.id === state.selectedId ? " selected" : "");
    slot.dataset.id = city.id;
    const rec = photoFor(city);
    applyPhotoToSlot(slot, rec);
    const caption = document.createElement("div");
    caption.className = "caption";
    caption.innerHTML =
      '<div class="name"></div><div class="time"></div><div class="zone"></div><div class="date"></div>';
    caption.querySelector(".name").textContent = city.name;
    slot.append(caption);
    if (isExtensionPanel) {
      const badge = document.createElement("div");
      badge.className = "toolbar-clock-badge";
      badge.textContent = "Toolbar clock";
      badge.title = "This city’s analog time is drawn on the browser toolbar.";
      if (city.id !== state.selectedId) badge.hidden = true;
      badge.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      slot.append(badge);
      const actions = document.createElement("div");
      actions.className = "slot-actions";
      const photoBtn = document.createElement("button");
      photoBtn.type = "button";
      photoBtn.className = "photo-btn";
      photoBtn.title =
        rec && rec.source === "user" ? "Restore Wikipedia photo" : "Use my photo";
      photoBtn.textContent = "📷";
      photoBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const current = photos[city.id];
        if (current && current.source === "user") {
          restoreWikipediaPhoto(city);
          return;
        }
        pendingPhotoId = city.id;
        photoFile.click();
      });
      const panBtn = document.createElement("button");
      panBtn.type = "button";
      panBtn.className = "pan-btn";
      panBtn.title = "Move photo";
      panBtn.setAttribute("aria-label", "Move " + city.name + " photo");
      panBtn.setAttribute("aria-pressed", "false");
      panBtn.textContent = "✥";
      panBtn.disabled = !imageUrlFromSlot(slot);
      panBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (panBtn.disabled) return;
        enterPanMode(city.id);
      });
      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "reset-pos-btn";
      resetBtn.title = "Reset photo position";
      resetBtn.setAttribute("aria-label", "Reset " + city.name + " photo position");
      resetBtn.textContent = "↺";
      resetBtn.hidden = true;
      resetBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        resetPhotoPos(city.id);
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.title = canRemove(state.cities) ? "Remove city" : "Keep at least one city";
      delBtn.textContent = "×";
      delBtn.disabled = !canRemove(state.cities);
      delBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (!canRemove(state.cities)) return;
        if (panningId === city.id || (panDrag && panDrag.id === city.id)) {
          finishActiveDrag(false);
          exitPanMode();
        }
        state.cities = state.cities.filter((c) => c.id !== city.id);
        if (state.selectedId === city.id) state.selectedId = state.cities[0].id;
        mergePhotoRecord(city.id, null);
        saveState();
        renderList();
      });
      actions.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      actions.addEventListener("click", (ev) => ev.stopPropagation());
      actions.append(photoBtn, panBtn, resetBtn, delBtn);
      slot.append(actions);

      const leftBtn = document.createElement("button");
      leftBtn.type = "button";
      leftBtn.className = "reorder-btn reorder-left";
      leftBtn.title = "Move left";
      leftBtn.setAttribute("aria-label", "Move " + city.name + " left");
      leftBtn.textContent = "‹";
      leftBtn.hidden = state.cities.length < 2 || cityIndex <= 0;
      leftBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        shiftCity(city.id, -1);
      });
      leftBtn.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      const rightBtn = document.createElement("button");
      rightBtn.type = "button";
      rightBtn.className = "reorder-btn reorder-right";
      rightBtn.title = "Move right";
      rightBtn.setAttribute("aria-label", "Move " + city.name + " right");
      rightBtn.textContent = "›";
      rightBtn.hidden = state.cities.length < 2 || cityIndex >= state.cities.length - 1;
      rightBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        shiftCity(city.id, 1);
      });
      rightBtn.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      slot.append(leftBtn, rightBtn);
    }
    if (isExtensionPanel) {
      slot.addEventListener("pointerdown", (ev) => {
        if (panningId !== city.id) return;
        if (panChromeTarget(ev.target)) return;
        if (ev.button != null && ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        startPanDrag(slot, city.id, ev);
      });
      slot.addEventListener("pointermove", (ev) => movePanDrag(slot, ev));
      slot.addEventListener("pointerup", (ev) => endPanDrag(slot, ev));
      slot.addEventListener("pointercancel", (ev) => endPanDrag(slot, ev));
      slot.addEventListener("lostpointercapture", (ev) => endPanDrag(slot, ev));
    }
    slot.addEventListener("click", (ev) => {
      if (panningId === city.id) {
        ev.stopPropagation();
        return;
      }
      if (panningId) exitPanMode();
      selectCity(city.id);
    });
    listEl.appendChild(slot);
    fetchAutoPhoto(city);
  }
  refreshAddButton();
  paintTimes();
}

function openOverlay(el) {
  exitPanMode();
  closeAllOverlays();
  el.hidden = false;
}

function closeOverlay(el) {
  el.hidden = true;
}

function closeAllOverlays() {
  if (settingsPanel) closeOverlay(settingsPanel);
  if (addPanel) closeOverlay(addPanel);
}

if (isExtensionPanel) {
  gearBtn.addEventListener("click", () => {
    use24HourEl.checked = state.use24Hour;
    showSecondsEl.checked = state.showSeconds;
    openOverlay(settingsPanel);
  });

  settingsDone.addEventListener("click", () => {
    state.use24Hour = use24HourEl.checked;
    state.showSeconds = showSecondsEl.checked;
    saveState();
    closeOverlay(settingsPanel);
    paintTimes();
  });

  addBtn.addEventListener("click", () => {
    cityInput.value = "";
    nameInput.value = "";
    addConfirm.disabled = true;
    resolvedAdd = null;
    if (state.cities.length >= MAX_CITIES) {
      tzHint.textContent = "The list is full (8 cities).";
    } else {
      tzHint.textContent = "Time zone will appear here";
    }
    openOverlay(addPanel);
    cityInput.focus();
  });

  addCancel.addEventListener("click", () => closeOverlay(addPanel));

  settingsPanel.addEventListener("click", (ev) => {
    if (ev.target === settingsPanel) closeOverlay(settingsPanel);
  });

  addPanel.addEventListener("click", (ev) => {
    if (ev.target === addPanel) closeOverlay(addPanel);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const overlayOpen =
      (settingsPanel && !settingsPanel.hidden) || (addPanel && !addPanel.hidden);
    if (overlayOpen) {
      closeAllOverlays();
      return;
    }
    exitPanMode();
  });

  const onGlobalPointerEnd = (ev) => {
    if (!panDrag) return;
    const slot = listEl.querySelector(slotSelector(panDrag.id));
    endPanDrag(slot, ev);
  };
  document.addEventListener("pointerup", onGlobalPointerEnd);
  document.addEventListener("pointercancel", onGlobalPointerEnd);
  window.addEventListener("pagehide", () => finishActiveDrag(true));

  cityInput.addEventListener("input", () => {
    const found = resolveZone(cityInput.value);
    resolvedAdd = found && found.tz ? found : null;
    if (!cityInput.value.trim()) {
      tzHint.textContent = "Time zone will appear here";
      addConfirm.disabled = true;
      return;
    }
    if (found && found.error === "ambiguous") {
      tzHint.textContent = "Several cities match. Type a fuller name.";
      addConfirm.disabled = true;
      return;
    }
    if (!found) {
      tzHint.textContent = "No matching time zone";
      addConfirm.disabled = true;
      return;
    }
    const err = canAddCity(state.cities, found.tz);
    tzHint.textContent = err || found.tz;
    addConfirm.disabled = Boolean(err);
  });
}

function confirmAdd() {
  if (!resolvedAdd) return;
  const tz = workingTz(resolvedAdd.tz) || resolvedAdd.tz;
  const err = canAddCity(state.cities, tz);
  if (err) return;
  const name = nameInput.value.trim() || resolvedAdd.label;
  if (!name) return;
  state.cities.push({ id: newCityId(), tz, name });
  saveState();
  closeOverlay(addPanel);
  renderList();
}

if (isExtensionPanel) {
  addConfirm.addEventListener("click", confirmAdd);

  cityInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !addConfirm.disabled) confirmAdd();
  });

  nameInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !addConfirm.disabled) confirmAdd();
  });

  photoFile.addEventListener("change", async () => {
    const file = photoFile.files && photoFile.files[0];
    const id = pendingPhotoId;
    photoFile.value = "";
    pendingPhotoId = null;
    if (!file || !id) return;
    try {
      stopPanForCity(id);
      const url = await resizeUserPhoto(file);
      const wikiUrl = rememberedWikiUrl(photos[id]);
      const rec = wikiUrl
        ? { source: "user", url, wikiUrl, pos: null }
        : { source: "user", url, pos: null };
      const wrote = await mergePhotoRecord(id, rec);
      const live = listEl.querySelector(slotSelector(id));
      if (!wrote) {
        if (live) live.title = "Could not save that photo";
        if (photos[id] && photos[id].url) applyPhotoToSlot(live, photos[id]);
        else {
          const city = state.cities.find((c) => c.id === id);
          if (city) fetchAutoPhoto(city);
        }
        return;
      }
      applyPhotoToSlot(live, photos[id]);
      const btn = live && live.querySelector(".photo-btn");
      if (btn) btn.title = "Restore Wikipedia photo";
    } catch (_) {
      const live = listEl.querySelector(slotSelector(id));
      if (live) live.title = "Could not use that photo";
    }
  });
}

async function refreshFromStorage() {
  applyingRemote = true;
  try {
    await loadState();
    await loadPhotos();
    prunePhotos();
    if (use24HourEl) use24HourEl.checked = state.use24Hour;
    if (showSecondsEl) showSecondsEl.checked = state.showSeconds;
    renderList();
  } finally {
    applyingRemote = false;
  }
}

async function init() {
  if (hasChromeStorage()) {
    await loadPhotoCache();
    await loadState();
    await loadPhotos();
  }
  if (!Array.isArray(state.cities) || !state.cities.length) {
    state.cities = copyDefaults();
    state.selectedId = state.cities[0].id;
    storageWasEmpty = true;
  }
  if (storageWasEmpty) saveState();
  prunePhotos();
  if (use24HourEl) use24HourEl.checked = state.use24Hour;
  if (showSecondsEl) showSecondsEl.checked = state.showSeconds;
  renderList();
  tickTimer = setInterval(paintTimes, 1000);
  if (hasChromeStorage()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync") {
        if (pendingStateWrites > 0) return;
        const watched = ["cities", "selectedId", "use24Hour", "showSeconds"];
        if (!watched.some((key) => Object.prototype.hasOwnProperty.call(changes, key))) return;
        refreshFromStorage();
        return;
      }
      if (area === "local" && Object.prototype.hasOwnProperty.call(changes, "photos")) {
        if (pendingPhotoWrites > 0) return;
        if (panningId || panDrag) {
          skippedPhotoRefresh = true;
          return;
        }
        refreshFromStorage();
      }
    });
  }
}

init();
