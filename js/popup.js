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
let pendingPhotoId = null;
let resolvedAdd = null;
let tickTimer = null;
let storageWasEmpty = false;
let applyingRemote = false;
let pendingStateWrites = 0;

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

function prunePhotos() {
  const ids = new Set(state.cities.map((city) => city.id));
  let changed = false;
  for (const id of Object.keys(photos)) {
    if (!ids.has(id)) {
      delete photos[id];
      changed = true;
    }
  }
  if (changed && hasChromeStorage()) chrome.storage.local.set({ photos });
}

function refreshAddButton() {
  if (!addBtn) return;
  const full = state.cities.length >= MAX_CITIES;
  addBtn.title = full ? "The list is full (8 cities)." : "Add city";
}

function mergePhotoRecord(id, rec) {
  return new Promise((resolve) => {
    if (rec && rec.source === "auto" && photos[id] && photos[id].source === "user") {
      resolve(false);
      return;
    }
    chrome.storage.local.get("photos", (raw) => {
      const stored = isPhotoMap(raw.photos) ? raw.photos : {};
      const next = { ...stored, ...photos };
      if (rec && rec.source === "auto" && next[id] && next[id].source === "user") {
        photos[id] = next[id];
        resolve(false);
        return;
      }
      if (rec === null) {
        delete next[id];
        delete photos[id];
      } else {
        next[id] = rec;
        photos[id] = rec;
      }
      chrome.storage.local.set({ photos: next }, () => {
        if (chrome.runtime.lastError) {
          if (stored[id]) photos[id] = stored[id];
          else delete photos[id];
          resolve(false);
          return;
        }
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

function applyPhotoToSlot(slot, rec) {
  if (!slot) return;
  if (rec && rec.url) {
    slot.style.backgroundImage = "url(" + JSON.stringify(rec.url) + ")";
    slot.title = rec.source === "user" ? "Your photo" : "Photo: Wikipedia";
  } else {
    slot.style.backgroundImage = "";
    slot.title = "";
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
        applyPhotoToSlot(live, { source: "auto", url: photo.url });
      });
    })
    .catch(() => {});
}

function restoreWikipediaPhoto(city) {
  delete photos[city.id];
  const live = listEl.querySelector(slotSelector(city.id));
  applyPhotoToSlot(live, null);
  const btn = live && live.querySelector(".photo-btn");
  if (btn) btn.title = "Use my photo";
  mergePhotoRecord(city.id, null).then(() => fetchAutoPhoto(city));
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
  document.documentElement.style.setProperty(
    "--city-count",
    String(Math.max(1, state.cities.length))
  );
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
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.title = canRemove(state.cities) ? "Remove city" : "Keep at least one city";
      delBtn.textContent = "×";
      delBtn.disabled = !canRemove(state.cities);
      delBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (!canRemove(state.cities)) return;
        state.cities = state.cities.filter((c) => c.id !== city.id);
        if (state.selectedId === city.id) state.selectedId = state.cities[0].id;
        mergePhotoRecord(city.id, null);
        saveState();
        renderList();
      });
      actions.append(photoBtn, delBtn);
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
      slot.append(leftBtn, rightBtn);
    }
    slot.addEventListener("click", () => selectCity(city.id));
    listEl.appendChild(slot);
    fetchAutoPhoto(city);
  }
  refreshAddButton();
  paintTimes();
}

function openOverlay(el) {
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
    closeAllOverlays();
  });

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
      const url = await resizeUserPhoto(file);
      photos[id] = { source: "user", url };
      const wrote = await mergePhotoRecord(id, { source: "user", url });
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
      applyPhotoToSlot(live, { source: "user", url });
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
        refreshFromStorage();
      }
    });
  }
}

init();
