function typicalAbbrev(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (/^[A-Z]{2,5}$/.test(trimmed)) return trimmed;
  return "";
}

function zoneNamePart(date, timeZone, locale, style) {
  try {
    const part = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: style,
    })
      .formatToParts(date)
      .find((item) => item.type === "timeZoneName");
    return part && part.value ? part.value : "";
  } catch (_) {
    return "";
  }
}

const ABBREV_LOCALES = ["en-GB", "en-AU", "en-US", "en", "ja-JP", "it-IT"];

export function zoneAbbrev(date, timeZone) {
  for (const locale of ABBREV_LOCALES) {
    const short = typicalAbbrev(zoneNamePart(date, timeZone, locale, "short"));
    if (short) return short;
  }
  for (const locale of ABBREV_LOCALES) {
    const generic = typicalAbbrev(zoneNamePart(date, timeZone, locale, "shortGeneric"));
    if (generic) return generic;
  }
  return "";
}

export function zoneGmtOffset(date, timeZone) {
  const longOffset = zoneNamePart(date, timeZone, "en-GB", "longOffset");
  if (longOffset) return longOffset.replace(/^UTC/, "GMT");
  return zoneNamePart(date, timeZone, "en-GB", "shortOffset") || "";
}

export function zoneLabel(date, timeZone) {
  const name = zoneAbbrev(date, timeZone);
  const offset = zoneGmtOffset(date, timeZone);
  if (name && offset) return name + " · " + offset;
  return name || offset;
}

export function zoneTimeParts(date, timeZone, use24Hour, showSeconds) {
  const timeOpts = {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: !use24Hour,
  };
  if (showSeconds) timeOpts.second = "2-digit";
  let time = new Intl.DateTimeFormat("en-GB", timeOpts).format(date);
  if (!use24Hour && !/[ap]\.?m\.?/i.test(time)) {
    const period = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: true,
    })
      .formatToParts(date)
      .find((part) => part.type === "dayPeriod");
    if (period && period.value) time = time + " " + period.value;
  }
  const dateText = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const hourRaw = Number(hm.find((p) => p.type === "hour")?.value);
  const minuteRaw = Number(hm.find((p) => p.type === "minute")?.value);
  const hour = Number.isFinite(hourRaw) ? hourRaw : 0;
  const minute = Number.isFinite(minuteRaw) ? minuteRaw : 0;
  return { time, dateText, hour, minute, zone: zoneLabel(date, timeZone) };
}
