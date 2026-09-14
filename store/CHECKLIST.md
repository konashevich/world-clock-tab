# Chrome Web Store publication checklist

## Ready in this repository

| Item | Status | Location |
|------|--------|----------|
| Extension package (manifest, code, icons) | Ready | project root |
| MIT license | Ready | `LICENSE` |
| Store icon 128×128 | Ready | `icons/icon128.png` |
| Screenshots 1280×800 (up to 5) | Ready | `store/screenshots/` |
| Small promo tile 440×280 | Ready | `store/promo/small-tile-440x280.png` |
| Marquee promo tile 1400×560 | Ready | `store/promo/marquee-1400x560.png` |
| Listing copy (short + detailed) | Ready | `store/listing.md` |
| Privacy policy text | Ready | `store/privacy-policy.md`, `store/privacy-policy.html` |
| Privacy dashboard answers | Ready | `store/dashboard-privacy-fields.md` |
| Demo video file | Ready | `screenshots/slides/World Clock Tab.mp4` (1920×1080, ~47 s) |
| ZIP packaging script | Ready | `scripts/package-webstore.sh` |

## You still need to do manually

1. **Developer account** — Register at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) if you have not already ($5 one-time registration fee).

2. **Privacy policy URL** — Upload `store/privacy-policy.html` somewhere public over HTTPS (GitHub Pages, your site, etc.) and use that URL in the dashboard.

3. **YouTube video** — Upload `screenshots/slides/World Clock Tab.mp4` to YouTube (Unlisted is fine). The store does **not** accept a direct MP4 upload; paste the YouTube link only.

4. **Create the store item** — Dashboard → New item → upload the ZIP from `scripts/package-webstore.sh`.

5. **Fill Store listing** — Paste text from `store/listing.md`; upload images from `store/screenshots/` and `store/promo/`.

6. **Fill Privacy practices** — Use `store/dashboard-privacy-fields.md`.

7. **Distribution** — Choose visibility (Public / Unlisted), countries, and whether it is free.

8. **Submit for review** — First review often takes a few business days; New Tab overrides can receive extra scrutiny.

## Optional improvements (not blocking)

- Public Git repository URL for homepage/support links
- Localized listings if you want non-English store pages later
- Replace annotated slides with additional clean full-browser screenshots if reviewers prefer less marketing-style art

## Package and upload

```bash
./scripts/package-webstore.sh
# Creates dist/world-clock-tab-<version>.zip
```

Upload that ZIP in the Developer Dashboard **Package** tab.
