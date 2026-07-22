# Dood (placeholder name)

A social app where every post has to be made live, inside the app — draw with a finger, stylus, or mouse, no uploads, no AI. Sits somewhere between Vine, Instagram, and DeviantArt: everything on the feed is guaranteed human-made, in real time.

This repo is the **Phase 1 prototype**: the core solo creative loop, built as a Progressive Web App (PWA) so it runs identically on iOS, Android, and desktop from a single codebase, installable straight from the browser with no app store required.

## What works right now

- Tapping "+ New" asks you to choose **Draw** (one image) or **Animate** (a looping frame sequence) — the two core creative modes.
- **Draw mode:** finger/stylus/mouse canvas, full color wheel plus quick-access presets, brush size, eraser, undo, clear — with up to 5 layers, each with its own visibility toggle, reorder (move up/down), and an optional background fill color so a background can't be erased or undone along with your drawing.
- **Animate mode:** up to 12 onion-skin frames. Each new frame starts as a copy of the last one, with the previous frame ghosted faintly behind it while you draw, so it's easy to nudge or tweak rather than redraw from scratch. Includes a preview-loop button to check pacing before posting, and per-frame delete/undo/clear.
- Post to a local feed. Animated posts loop automatically in the feed like a tiny GIF.
- Every post is tagged with what it was made on (finger / stylus / mouse), detected automatically.
- Every post auto-generates a **replay**: for a drawing, a stroke-by-stroke timelapse across all layers in true chronological order; for an animation, each frame's construction is revealed in sequence before it settles into looping the finished result. Reconstructed from recorded stroke data, not a screen recording.
- Installable as a home-screen app on iOS (Safari → Share → Add to Home Screen) and Android (Chrome → Add to Home Screen), and works offline once installed thanks to a service worker (network-first, so you always get the latest version when online).

## What's intentionally not here yet

Per the phased MVP plan (see `docs/Dood_Concept.docx` if included, or the project's concept doc): sound (voice filters, SFX, music maker), a real social graph (follow/like/comment persistence across users), and moderation. This prototype exists to validate the core "make something live, watch it replay" loop before building anything further.

## Project structure

```
dood-app/
├── index.html          entry point, PWA meta tags
├── styles.css           all styling
├── app.js                drawing, replay, feed, and service worker registration logic
├── manifest.json         PWA manifest (name, icons, colors, display mode)
├── service-worker.js     offline caching for installability
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

No build step, no framework, no dependencies — plain HTML/CSS/JS so it's easy to read and modify.

## Running it locally

Service workers (and therefore full installability) require the app to be served over `http://` or `https://`, not opened directly as a `file://` path. From this folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000 in a browser
```

Any static server works — `npx serve`, `php -S localhost:8000`, etc.

## Installing on a phone

1. Deploy the folder somewhere public (see below), or run it on your computer and visit that address from your phone on the same network.
2. **iOS (Safari):** open the URL → tap the Share icon → "Add to Home Screen."
3. **Android (Chrome):** open the URL → tap the menu (⋮) → "Add to Home Screen" or "Install app."

It'll then open full-screen like a native app, with its own icon.

## Deploying

The simplest free option is **GitHub Pages**, since this is a static site with no server-side code:

1. Push this repo to GitHub.
2. In the repo settings, go to **Pages**, set the source to the `main` branch (root), and save.
3. GitHub will publish it at `https://<username>.github.io/<repo-name>/`.

Any other static host (Netlify, Vercel, Cloudflare Pages) works the same way — just point it at this folder.

## Data & privacy note

This prototype stores posts in the browser's `localStorage` only — nothing leaves the device, there's no backend, and posts won't sync across devices or browsers. That's expected for a Phase 1 validation build, not a bug.
