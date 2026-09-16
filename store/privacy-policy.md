# Privacy Policy — World Clock Tab

**Last updated:** 16 September 2026

**Publisher:** Oleksii Konashevych

**Contact:** konoshevich@gmail.com

## Overview

World Clock Tab is a browser extension for Chrome and Brave. It replaces the New Tab page with a world clock and provides a toolbar popup for settings. This policy describes what data the extension handles and how.

## Data stored on your device

The extension stores the following locally on your device. It is not sent to a first-party server.

- Your list of cities (display names and IANA time zones) in `chrome.storage.sync`
- Which city is selected for the toolbar analog clock
- Clock preferences (24-hour format, show seconds)
- Wikipedia photo lookup metadata (article titles and image URLs) in `chrome.storage.local`
- Wikimedia image files for your assigned cities in the browser Cache Storage, so New Tab columns can appear without downloading those files again
- Optional custom photo overrides you choose to upload, stored locally in `chrome.storage.local`

This data stays on your device. World Clock Tab does not operate a backend server and does not receive copies of your city list or settings.

## Network requests

When you add a city, restore a Wikipedia photo, or start the browser with assigned photos that are not already in Cache Storage, the extension may contact:

- `en.wikipedia.org` — article summary and title lookup
- `upload.wikimedia.org` and `thumb.wikimedia.org` — city images

These requests include the city or article names needed to find public Wikipedia content. They do not include your identity, browsing history, or extension settings beyond what is required for the lookup query. The minute toolbar-clock alarm does not download photos.

## Data we do not collect

World Clock Tab does not:

- Sell or share personal data
- Use analytics or advertising SDKs
- Collect account information (the extension has no sign-in)
- Track websites you visit outside the extension’s own pages

## Permissions

- **Storage** — save your cities, settings, and photo lookup metadata locally
- **Alarms** — update the toolbar analog clock each minute
- **Host access to Wikipedia/Wikimedia** — fetch public city photos and article summaries

## Children

World Clock Tab is a general productivity tool and is not directed at children under 13.

## Changes

If this policy changes, the updated text will be published at the same URL with a revised “Last updated” date.

## Contact

Questions about this policy: konoshevich@gmail.com
