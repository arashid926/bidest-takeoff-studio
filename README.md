# BidEst Take-Off Studio

Quantity take-off and bill of quantities studio for tender estimating, measured to **RICS NRM2**.
Drawing take-off from PDF and DXF, element schedules, the traditional dimension sheet, a five-standard
abstract, the priced bill, tender estimate and risk register — exported as one Excel workbook.

It is a plain static web app: no server, no build step, no account. It installs as a desktop or
phone app (PWA) and works offline once opened.

## Run it

**Online (recommended)** — published with GitHub Pages, see *Publish* below. Open the link in Chrome or
Edge and choose **Install** in the address bar to get a desktop app with its own window and icon.

**On your computer** — the drawing take-off needs the page served over http, not opened as a file:

```bash
cd bidest-takeoff-studio
python -m http.server 8080
# then open http://localhost:8080
```

## Publish on GitHub

1. Create a new repository on GitHub, e.g. `bidest-takeoff-studio` (public, or private on a paid plan).
2. Upload the contents of this folder (drag the files into *Add file → Upload files*, or push with git):
   ```bash
   git init
   git add .
   git commit -m "BidEst Take-Off Studio"
   git branch -M main
   git remote add origin https://github.com/<your-user>/bidest-takeoff-studio.git
   git push -u origin main
   ```
3. In the repository go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
4. The included workflow deploys on every push to `main`. The site appears at
   `https://<your-user>.github.io/bidest-takeoff-studio/`.

## Where your work is saved

Projects, templates, the shared price library and attached drawings are saved **in your browser on this
computer** (IndexedDB). Nothing is uploaded anywhere — the GitHub repository only holds the app itself,
never your projects.

- **Projects → Back up all** downloads one `.json` file with every project, template, rate and drawing.
- **Projects → Restore backup** loads that file into any browser — use it to move to another PC or as a
  safety copy. Back up regularly; clearing browser data deletes local projects.
- A private/incognito window cannot keep projects. Export to Excel always works.

## Files

| Path | What it is |
|---|---|
| `index.html` | The studio: UI, measurement engine, BOQ, estimate and Excel writer |
| `js/takeoff.js` | Drawing take-off: PDF/DXF sheets, scale calibration, measuring tools |
| `js/host.js` | Local storage, file downloads and drawing storage, plus backup/restore |
| `assets/demo-gf-plan.pdf` | Example ground-floor plan for the take-off demo |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and app install |
| `.github/workflows/pages.yml` | Automatic deployment to GitHub Pages |

## Updating

Edit the files, bump `VERSION` in `sw.js` (e.g. `bidest-takeoff-v1.0.1`) so installed copies pick up the
change, then commit and push.

## Dependencies

Loaded from CDN and cached for offline use: [pdf.js](https://mozilla.github.io/pdf.js/) 3.11.174
(Apache-2.0) and Google Fonts (Archivo, JetBrains Mono, Source Serif 4 — OFL).

## Disclaimer

This software is provided "as is", without warranty of any kind. Quantities, rates and estimates produced
with it must be checked by a qualified quantity surveyor before use in any tender, contract or valuation.
The author accepts no liability for any loss arising from its use.

---
© Abdul Rashid. All rights reserved.
