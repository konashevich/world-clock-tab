export const MAX_CITIES = 8;

export function pickTz(preferred, fallback) {
  for (const tz of [preferred, fallback]) {
    if (!tz) continue;
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: tz }).format(new Date());
      return tz;
    } catch (_) {
      /* try next */
    }
  }
  return preferred;
}

export const DEFAULT_CITIES = [
  { id: "sydney", tz: "Australia/Sydney", name: "Sydney" },
  { id: "kyiv", tz: pickTz("Europe/Kyiv", "Europe/Kiev"), name: "Kyiv" },
  { id: "rome", tz: "Europe/Rome", name: "Rome" },
  { id: "london", tz: "Europe/London", name: "London" },
];

const KYIV_TZ = pickTz("Europe/Kyiv", "Europe/Kiev");
const KOLKATA_TZ = pickTz("Asia/Kolkata", "Asia/Calcutta");

const ALIASES = {
  kiev: { tz: KYIV_TZ, label: "Kyiv" },
  kyiv: { tz: KYIV_TZ, label: "Kyiv" },
  sydney: { tz: "Australia/Sydney", label: "Sydney" },
  rome: { tz: "Europe/Rome", label: "Rome" },
  london: { tz: "Europe/London", label: "London" },
  "new york": { tz: "America/New_York", label: "New York" },
  tokyo: { tz: "Asia/Tokyo", label: "Tokyo" },
  paris: { tz: "Europe/Paris", label: "Paris" },
  kolkata: { tz: KOLKATA_TZ, label: "Kolkata" },
  calcutta: { tz: KOLKATA_TZ, label: "Kolkata" },
  saigon: { tz: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh City" },
};

export function workingTz(tz) {
  if (!tz || typeof tz !== "string") return null;
  const fallback =
    tz === "Europe/Kyiv" ? "Europe/Kiev" : tz === "Europe/Kiev" ? "Europe/Kyiv" : "";
  const picked = pickTz(tz, fallback);
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: picked }).format(new Date());
    return picked;
  } catch (_) {
    return null;
  }
}

export function canonicalTz(tz) {
  const worked = workingTz(tz);
  if (!worked) return "";
  try {
    return (
      new Intl.DateTimeFormat("en-GB", { timeZone: worked }).resolvedOptions().timeZone ||
      worked
    );
  } catch (_) {
    return worked;
  }
}

function supportedZones() {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone");
    }
  } catch (_) {
    /* ignore */
  }
  return DEFAULT_CITIES.map((c) => c.tz);
}

export function cityFromZone(tz) {
  if (!tz) return "";
  return tz.split("/").pop().replace(/_/g, " ");
}

export function resolveZone(query) {
  const q = String(query || "")
    .trim()
    .replace(/_/g, " ");
  if (!q) return null;
  const lower = q.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];

  const zones = supportedZones();
  const ianaNeedle = q.replace(/ /g, "_");
  const exactIana = zones.find((z) => z.toLowerCase() === ianaNeedle.toLowerCase());
  if (exactIana) {
    const tz = workingTz(exactIana) || exactIana;
    return { tz, label: cityFromZone(tz) };
  }

  if (q.includes("/")) {
    const tried = workingTz(ianaNeedle);
    if (tried) return { tz: tried, label: cityFromZone(tried) };
  }

  const pickUnique = (list) => {
    if (list.length === 1) return { tz: list[0], label: cityFromZone(list[0]) };
    if (list.length > 1) return { error: "ambiguous" };
    return null;
  };

  const exactCity = pickUnique(zones.filter((z) => cityFromZone(z).toLowerCase() === lower));
  if (exactCity) return exactCity;

  const prefix = pickUnique(
    zones.filter((z) => cityFromZone(z).toLowerCase().startsWith(lower))
  );
  if (prefix) return prefix;

  const includes = pickUnique(
    zones.filter((z) => cityFromZone(z).toLowerCase().includes(lower))
  );
  if (includes) return includes;
  return null;
}

export function newCityId() {
  return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

export function sameZone(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = canonicalTz(a);
  const cb = canonicalTz(b);
  return Boolean(ca) && ca === cb;
}

export function canAddCity(cities, tz) {
  if (!tz) return "Choose a city with a known time zone.";
  if (cities.length >= MAX_CITIES) return "The list is full (8 cities).";
  if (cities.some((c) => sameZone(c.tz, tz))) return "That time zone is already on the list.";
  return "";
}

export function canRemove(cities) {
  return cities.length > 1;
}

/** Move a city left (−1) or right (+1). Returns the same array if the move is impossible. */
export function moveCity(cities, id, delta) {
  if (delta !== -1 && delta !== 1) return cities;
  const index = cities.findIndex((c) => c.id === id);
  if (index < 0) return cities;
  const next = index + delta;
  if (next < 0 || next >= cities.length) return cities;
  const copy = cities.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

export function copyDefaults() {
  return DEFAULT_CITIES.map((city) => ({ ...city }));
}

export function sanitizeCities(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const city of list) {
    if (!city || typeof city !== "object") continue;
    const tzRaw = typeof city.tz === "string" ? city.tz : "";
    const tz = workingTz(tzRaw);
    const name = typeof city.name === "string" ? city.name.trim() : "";
    if (!tz || !name) continue;
    const key = canonicalTz(tz) || tz;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = typeof city.id === "string" && city.id.trim() ? city.id : newCityId();
    out.push({ id, tz, name });
    if (out.length >= MAX_CITIES) break;
  }
  return out;
}
