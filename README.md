# World Clock Tab

World Clock Tab is a Manifest V3 extension for Brave and Chrome. It replaces the New Tab page with a row of full-height city columns. Each column shows a photo, the city name, the local time, the typical zone name (for example CEST) plus the GMT offset (for example GMT+02:00), and the date. Settings, photo overrides, city add or remove, and column order live in the toolbar popup, not on the New Tab page. The toolbar analog clock follows the city you select.

This codebase was written from scratch. It is not a fork of the Chrome Web Store extension World Clocks.

## Features

The New Tab page is the **home tab**. It is display-only: columns, photos, and times, with no header, settings, or edit buttons. You configure the extension from the **extension panel**, the popup that opens when you click the pinned toolbar icon.

Click a city column on either surface to select it. The analog clock on the browser toolbar follows that city. In the extension panel the chosen column keeps a blue frame and a separate black bar at the bottom that says “Toolbar clock”. That label is not on the home tab.

Default cities are Sydney, Kyiv, Rome, and London, shown left to right. You can keep up to eight cities. The last remaining city cannot be deleted. Duplicate time zones, including IANA aliases such as Kyiv and Kiev, are rejected.

In the extension panel, ‹ and › buttons on each column move that city left or right. The home tab uses the same order as soon as it is saved. There is no drag-and-drop, and the home tab has no reorder controls.

The clock uses 24-hour time by default. Seconds are optional and appear only on the digital clocks, not on the toolbar analog face. Those options live under the settings gear in the extension panel.

When you add a city, type a city name and the matching IANA time zone appears as a hint. You can set an optional display name that differs from the name used to look up the zone.

City photos come from Wikipedia through the public REST and OpenSearch APIs, with a local cache. You can override a photo from the extension panel and restore the Wikipedia image later.

## Install unpacked

1. Clone this repository.
2. Open `brave://extensions` or `chrome://extensions`.
3. Turn on Developer mode.
4. Click **Load unpacked** and select this folder (the one that contains `manifest.json`).
5. If another New Tab extension is enabled, disable it, or this page will not become the New Tab page.

After you change `manifest.json`, click **Reload** on the extensions page so the New Tab override is picked up.

`preview-icons.html` and `preview-brand-icon.html` are local icon design previews. They are not part of the running extension.

## Privacy

City photos are requested from `en.wikipedia.org` and Wikimedia upload hosts. Your city list and settings are stored in the browser’s extension storage. This extension does not send that data to a first-party server and does not include analytics.

## Chrome Web Store

Publication assets and dashboard copy live in [`store/`](store/). Run `./scripts/package-webstore.sh` to build `dist/world-clock-tab-<version>.zip` for upload.

**Privacy policy:** https://konashevich.github.io/world-clock-tab/privacy-policy.html

**Promotional video:** https://youtu.be/D7P-_ZZLcUg

See [`store/CHECKLIST.md`](store/CHECKLIST.md) for what is ready and what you still need (developer account, dashboard submission).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
