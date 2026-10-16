# tools

Build-time helpers. The site itself has no build step — these only regenerate assets.

## anatomy/ — Fig. 01 (the 4 km link)

Isometric figure built with the anatomy kit (vendored in `anatomy/kit/`).

```sh
node tools/anatomy/radio-link/build.mjs          # writes assets/js/fig-link.js + assets/css/iso.css
node tools/anatomy/radio-link/build.mjs --audit  # proves geometry / painter's order
```

## og/ — social card

`og/og.html` renders the 1200×630 share image with the halftone planet. Serve the repo root
(`python3 -m http.server`), open `/tools/og/og.html` at 1200×630 in a headless browser and
screenshot it to `/og-image.png`.
