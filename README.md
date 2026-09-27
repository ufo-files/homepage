# UFO Files Homepage

The static public entry point for [UFO Files](https://ufo-files.app).

![UFO Files homepage](screenshots/after-desktop.png)

## Design

Based on [Glenn Sorrentino’s original design system](https://github.com/glenn-sorrentino/design-system),
revision `f89ec1a5b233fb94fa4779aa426d928d3f59bfc9`. The original reset,
stylesheet, and locally served Atkinson Hyperlegible / IBM Plex Mono fonts are
in `src/`. UFO Files adaptations live in `styles.css`.

The page uses the template’s island header, intro, statement, feature, and FAQ
structure. Navigation is progressively enhanced for mobile; native disclosure
controls keep the FAQ usable without JavaScript. Research and contact links
continue to open the existing tools.

## Local preview

```sh
python3 -m http.server 8124 --bind 0.0.0.0
```

Then open <http://127.0.0.1:8124>.

## Validation

```sh
npm ci
npm test
node --check script.js
npm run screenshots
```

Before/after desktop and phone captures are in `screenshots/`. The screenshot
command updates the standard images in `assets/`.

GitHub Pages publishes the repository root from `main` to the custom domain in
`CNAME`.
