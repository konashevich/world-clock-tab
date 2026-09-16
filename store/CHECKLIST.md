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
| Privacy policy text | **Live** | https://konashevich.github.io/world-clock-tab/privacy-policy.html |
| Privacy dashboard answers | Ready | `store/dashboard-privacy-fields.md` |
| Promotional video (YouTube) | **Live** | https://youtu.be/D7P-_ZZLcUg |
| Chrome Web Store developer account | **Exists** | `konoshevich@gmail.com` (publisher `d7a941da-a849-4e7a-aca2-86ca562d724d`) |
| ZIP packaging script | Ready | `scripts/package-webstore.sh` |

## Publisher (already registered)

Do not register a new developer account. This machine’s Chrome Web Store publisher is already `konoshevich@gmail.com`. The publisher ID (same as Google Drive Pin Folder) is:

```text
d7a941da-a849-4e7a-aca2-86ca562d724d
```

Dashboard:

https://chrome.google.com/webstore/devconsole/d7a941da-a849-4e7a-aca2-86ca562d724d

World Clock Tab item ID (Chrome Web Store):

```text
gjgdmfedocjbfmgagddlgeminflhdmek
```

Item editor:

https://chrome.google.com/webstore/devconsole/d7a941da-a849-4e7a-aca2-86ca562d724d/gjgdmfedocjbfmgagddlgeminflhdmek/edit

## Dashboard status

Live item is **1.1.12**. Package **1.1.13** is uploaded and **PENDING_REVIEW** (submitted 16 September 2026). It adds photo reposition (Move photo / Reset) in the extension panel.

Store listing screenshots and What’s new cannot be changed through the API. After review, or while the item is in the dashboard, paste the What’s new text from `store/listing.md` and replace listing screenshots with:

1. `store/screenshots/01-new-tab-home.png`
2. `store/screenshots/02-extension-panel.png`
3. `store/screenshots/07-move-photo.png`
4. `store/screenshots/05-slide3.png`
5. `store/screenshots/06-slide4.png`

Privacy policy: https://konashevich.github.io/world-clock-tab/privacy-policy.html  
Promo video: https://youtu.be/D7P-_ZZLcUg

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
