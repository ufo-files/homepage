# UFO Files Homepage

[![pages-build-deployment](https://github.com/ufo-files/homepage/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/ufo-files/homepage/actions/workflows/pages/pages-build-deployment)

Static homepage for [UFO Files](https://ufo-files.app), the public entry point for the project and its related research tools.

![UFO Files homepage hero](assets/homepage-hero.png)

## Live Site

- Production: <https://ufo-files.app>
- GitHub Pages source: `main` branch, repository root
- Custom domain: configured through `CNAME`

## Sections

The page is a single static document with sections for:

- Intro hero
- About the project
- Relationship Graph
- Dog Whistle
- Meditation
- Entrainment
- Contact

The Team section is intentionally removed until the real team content is ready.

## Local Preview

This site has no build step. You can open `index.html` directly, or serve the repo root:

```sh
python3 -m http.server 8124
```

Then visit:

```txt
http://127.0.0.1:8124
```

## Files

- `index.html`: page structure and links
- `styles.css`: layout, typography, section styling, responsive behavior
- `script.js`: ambient background field and pointer interaction
- `assets/`: generated app previews and README screenshot. Relationship Graph
  and Entrainment previews are SVGs rebuilt by `npm run screenshots`.
- `CNAME`: GitHub Pages custom domain

## Deployment

Push changes to `main`. GitHub Pages publishes the static files at the custom domain after the Pages build completes.
