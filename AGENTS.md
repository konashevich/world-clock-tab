# World Clock Tab

## What this is

World Clock Tab is a standalone Manifest V3 Brave/Chrome extension. It has two surfaces:

- **Home tab** — the browser New Tab page (`newtab.html`). It shows only the vertical city columns (photo, city name, time, typical zone name such as CEST plus the GMT offset such as GMT+02:00, and date). No header, settings, photo buttons, remove buttons, reorder arrows, or Add city.
- **Extension panel** — the toolbar popup (`popup.html`) that opens when the pinned extension icon is clicked. This is where settings, photo overrides, city add/remove, reorder, and the settings gear live.

The toolbar analog clock follows the selected city.

Load unpacked from this repository root (the folder that contains `manifest.json`).

After you change `manifest.json`, click **Reload** on `brave://extensions` (or `chrome://extensions`) so the New Tab override is picked up. If another New Tab extension is also enabled, disable it, or this page will not win.

## Origin and license stance

This project is released under the MIT License. See `LICENSE`.

This project is **conceptually** related to earlier exploration in a sibling folder named World Clock Plus. That earlier folder held a private fork of the Chrome Web Store extension **World Clocks** (`hobnkbcfnolegmdfmfakkcllnblnonhb`, by justdecodeme / Rakesh Kumar). That store listing had **no MIT (or similar) license**. The fork was useful for exploring the idea, but it was not a safe base to publish or keep building on.

World Clock Tab was therefore written **from scratch** (vanilla JS/CSS, new modules, new UI). Do not copy HTML, CSS, JS, timezone data, or minified assets from World Clock Plus into this tree. The old folder is a **reference for product intent only**, not a source of code.

## Design decisions to keep

- Default cities in order: Sydney, Kyiv, Rome, London.
- Vertical slots arranged left to right (Sydney, Kyiv, Rome, London by default). Each city is a full-height vertical column, not a horizontal strip stacked top to bottom. White text in a rounded semi-transparent caption; no color/style pickers.
- Click a slot to select it. That city drives the **toolbar clock** (the analog face on the browser toolbar). In the extension panel the chosen city keeps the blue frame and a separate black bar at the bottom of the column with blue “Toolbar clock” text. That label is not inside the time caption and does not overlap the photo or remove buttons. The home tab does not show the badge.
- Home tab is display-only. Configuration (settings gear, photo camera, remove, reorder, Add city) exists only in the extension panel.
- Reorder cities only in the extension panel, with ‹ and › buttons on each column (not drag-and-drop, not on the home tab). The first column has no left arrow and the last has no right arrow. Order is stored in `chrome.storage.sync`, so the home tab follows without its own controls.
- 24-hour on by default; seconds optional and digital-only on both surfaces.
- Max 8 cities; cannot delete the last city; duplicate time zones (including IANA aliases such as Kyiv/Kiev) are rejected.
- Photos: Wikipedia REST/opensearch pipeline with local cache; optional user photo override and restore to Wikipedia. In the extension panel, Move photo (✥) lets you drag a city picture; Reset (↺) restores centre. The home tab is still display-only.
- Branding globe SVG may exist as static fallback icons. The runtime toolbar icon is a drawn analog face: white disk filling the square, dark rim, four ticks at 16px (twelve on larger sizes), thick dark hour and minute hands (the Fill + high contrast design).

## Prior discussion

Full design and rewrite discussion (started in the World Clock Plus workspace):

- Cursor chat: [World Clock Tab rewrite](b4d587b3-95ac-4d32-936e-5719a30bf041)

### Short history (if the chat is unavailable)

1. User wanted a World Clocks–style city list with photos and a clearer toolbar clock.
2. The store extension was copied into World Clock Plus and enhanced (photos, UI cleanup), then stopped as a fork because of the missing license.
3. World Clock Tab was built from scratch with the decisions above, reviewed and bug-fixed in place (zones, photo races, overlays, alarm/icon painting).
4. The first private unpacked build was a toolbar popup only. The New Tab override (`newtab.html`) was added so Brave/Chrome treat this extension as the default new-tab page, matching the original product intent.
5. Ready for private unpacked use in Brave. Chrome Web Store item `gjgdmfedocjbfmgagddlgeminflhdmek` is public at version 1.1.12; 1.1.13 adds photo reposition in the extension panel. Privacy policy and demo video are live (`https://konashevich.github.io/world-clock-tab/privacy-policy.html`, `https://youtu.be/D7P-_ZZLcUg`).
6. City reorder was added later as ‹ › arrows in the extension panel so the home tab stays display-only.
