# UFO Files Homepage

The static public entry point for [UFO Files](https://ufo-files.app).

![UFO Files homepage](https://raw.githubusercontent.com/ufo-files/homepage/screenshots/homepage-hero.png)

## Design

Based on [Glenn Sorrentino’s original design system](https://github.com/glenn-sorrentino/design-system),
revision `f89ec1a5b233fb94fa4779aa426d928d3f59bfc9`. The original reset,
stylesheet, and bundled template fonts are in `src/`. UFO Files adaptations
live in `styles.css`, mapping the graph app’s paper/ink palette and IBM Plex
Mono regular/bold typography onto the template. Active font files and their
license are in `assets/fonts/`.

The intro background uses node and edge geometry from the existing graph SVG,
with labels removed for a decorative background. The page uses the template’s
island header, intro, statement, feature, and FAQ
structure, with features for Timeline, Map, Galactic Entities, Species, Signals,
and Programs. Feature images and the social preview load directly from the research
app’s automatically refreshed screenshot gallery on `main` via raw GitHub URLs.
Successful graph deployments refresh that gallery, so new captures appear here
without a homepage release, subject to browser/CDN and social-platform caching.
Each button opens its corresponding view. Navigation is progressively enhanced for mobile; native disclosure
controls keep the FAQ usable without JavaScript. Research and contact links
continue to open the existing tools.

The intro badge reads the live `counts.documents` total from the graph app’s
published catalog. It requests only the first 16 KiB, cancels the stream once
the count and source directory are found, and refreshes each minute while the page is visible.
Failures show “Record count unavailable” and retry automatically. The sources
table shares this request, showing record counts, word counts, collection shares,
and source/research links. Its saved HTML snapshot remains usable offline or
without JavaScript. The February 2008 MUFON journal was moved into Whitepapers
on 2026-09-27; older catalog snapshots group that one known record under its
new collection, with research links covering both names until the rebuild.
The UPDB-MUFON collection is separate. The intro graph drifts slowly and
respects reduced motion.

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

After successful deployments, GitHub Actions captures desktop, mobile, and
full-page images on a hosted runner. It uploads all three as run artifacts and
publishes them to the `screenshots` branch using the built-in workflow token.
The README image follows that branch; `source-revision.txt` records the captured
commit. Captures do not write to protected `main` or trigger another deployment.
Manual runs on other branches upload review artifacts without publishing them.

GitHub Pages publishes the repository root from `main` to the custom domain in
`CNAME`.

## Source file inventory

`source-inventory.json` is a dated inventory of archived content files, including
individual scans and alternate formats. It excludes metadata, logs, ZIP bundles,
and partial downloads. These totals are distinct from searchable catalog records.
The table shows ✅ only when every source file has a machine-readable output
with matching source path and byte size. ❌ includes incomplete or unverified
coverage; this checks processing coverage, not the accuracy of extracted text.

Refresh on the archive host with:

```sh
python3 scripts/build_source_inventory.py '/Volumes/UFO Files Archive 1'
python3 -m unittest discover -s scripts -p test_source_inventory.py
```

Publish the refreshed JSON with the website. The page fetches the latest
published inventory alongside the catalog and displays the inventory timestamp.

The live inventory worker checks each source once every 24 hours and publishes
at most one successful update every 24 hours. Saved check and publication times
survive service restarts. Failed publications retry after one minute. The homepage
can continue polling the saved feed without rescanning the archive.
