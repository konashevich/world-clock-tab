# Developer Dashboard — Privacy practices tab

Copy these into **Privacy practices** when you upload the extension package.

## Single purpose description

Replace the browser New Tab page with a multi-city world clock display, and provide a toolbar popup to configure cities, photos, and clock options.

## Permissions justification

### storage

Stores your city list, selected toolbar city, 24-hour/seconds preferences, Wikipedia photo cache, and optional custom photo overrides locally in the browser. Required for the extension to remember settings between sessions and sync cities across devices when Chrome sync is enabled.

### alarms

Runs once per minute to repaint the toolbar analog clock icon when the selected city’s local time changes. No background network activity is tied to this alarm.

### Host permission: https://en.wikipedia.org/*

Fetches public Wikipedia article summaries and page titles when you add a city or restore a default photo, so the extension can locate appropriate city images.

### Host permission: https://upload.wikimedia.org/* and https://thumb.wikimedia.org/*

Downloads Wikimedia Commons images referenced by Wikipedia for city column backgrounds. Images are cached locally after download.

## Remote code

**No, I am not using remote code.**

The extension ships all JavaScript in the package. It fetches image and JSON data from Wikipedia APIs but does not download or execute remote scripts.

## Data usage (Chrome Web Store disclosure)

Check only what applies:

**Collected data types**

- [ ] Personally identifiable information
- [ ] Health information
- [ ] Financial and payment information
- [ ] Authentication information
- [ ] Personal communications
- [ ] Location — *do not check; the extension uses time zones you type, not GPS*
- [ ] Web history
- [ ] User activity
- [x] **Website content** — Wikipedia article summaries and images for cities you add (not general browsing history)

If the form separates “photos/videos” or “user-generated content,” you may also disclose optional custom city photos the user uploads; those stay local.

**Certifications (Limited Use)**

- [x] I do not sell or transfer user data to third parties for purposes unrelated to the item’s core functionality
- [x] I do not use or transfer user data for purposes unrelated to the item’s core functionality
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

## Privacy policy URL

**Privacy policy URL (live):**

```
https://konashevich.github.io/world-clock-tab/privacy-policy.html
```

Paste that URL here and under **Account → Privacy policy** if the dashboard asks for it separately.
