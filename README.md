# UFO Files Homepage

[![pages-build-deployment](https://github.com/ufo-files/homepage/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/ufo-files/homepage/actions/workflows/pages/pages-build-deployment)

The static public entry point for [UFO Files](https://ufo-files.app).

![UFO Files archival homepage](assets/homepage-hero.png)

## Design

The homepage is one responsive, non-scrolling viewport composed as a public
government case file. Its folder, envelope, stamps, labels, and routing-slip
language is based on lead pages in public Department of War releases, while
all visual material is recreated as HTML, CSS, and SVG rather than scans. The
interface remains semantic HTML: the physical-looking controls are ordinary
links with keyboard focus states and readable labels.

## Local preview

```sh
python3 -m http.server 8124
```

Then open <http://127.0.0.1:8124>.

## Validation

```sh
npm ci
npm test
npm run screenshots
```

GitHub Pages publishes the repository root from `main` to the custom domain in
`CNAME`.
