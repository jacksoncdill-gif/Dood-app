# Dood — Feature Roadmap

A running checklist so we can track what's actually built vs. what's still ahead. Ordered so core mechanics come before more visual polish, per your call.

## Done so far

- [x] Draw mode: finger/stylus/mouse input, up to 5 layers (visibility, reorder, delete, background color), color wheel + presets, brush size, brush/eraser toggle, undo, clear
- [x] Animate mode: up to 12 frames, onion skin with Copy (duplicate last frame) or Trace (blank + ghost) modes, add/delete frame, per-frame tools, preview loop
- [x] Landscape (16:9) canvas everywhere
- [x] Post to a feed, with a stroke-by-stroke "replay" (not a screen recording) for both draw and animate posts
- [x] Installable PWA — works offline, deployed to GitHub Pages
- [x] Visual identity, Stage 1 (palette, typography, custom icons, mascot) — paused here per your note; resume after mechanics below

## Core drawing/animation mechanics — still to build

- [ ] Real undo/redo stack (Redo button exists today but is disabled)
- [ ] Brush variety: opacity control, maybe one or two brush textures beyond a single round tip
- [ ] Layer opacity / blend modes (optional — visibility toggle covers the basics today)
- [ ] Onion skin looking back more than one frame (optional, lower priority)

## Sound — your key differentiator (0% built right now)

- [ ] Voice recording with pitch/filter effects
- [ ] Sound-effect library, attach an SFX to a frame or stroke
- [ ] Crude music maker (Mario Paint Composer–style step sequencer)
- [ ] Audio playback synced to animate frame timing

## Making it an actual social app (right now it's single-device only)

- [ ] Real accounts (sign up / log in) — today every post saves to your own device's local storage only; no one else can see it
- [ ] Backend + database so posts sync across devices and between users — this is the single biggest technical lift, and realistically the point where most solo non-technical founders bring in outside help or lean on a managed platform (e.g. Firebase/Supabase) rather than hand-rolling it
- [ ] Real "likes" (currently a static number with no tap-to-like)
- [ ] Comments
- [ ] Following / discovery feed, search or tags
- [ ] Share sheet (share a post outside the app)

## Safety & moderation

You flagged this early — worth having in place before strangers can see each other's posts.

- [ ] Report/flag a post (nudity, hate speech, etc.)
- [ ] Some basic automated screening, since replay loops mean someone could draw something briefly then erase it before posting
- [ ] Terms of service / community guidelines page

## Visual identity — paused, resume after the above

- [ ] Stage 2: Animate workspace redesign (frame strip, cel navigator)
- [ ] Feed redesign
- [ ] Interface sound effects (ties in once sound exists)
- [ ] Final app icon / splash screen art

## Suggested order

1. **Finish drawing/animation basics** — redo, brush polish. Quick, self-contained, no new architecture needed.
2. **Add sound** — this is what actually separates Dood from ibis Paint X / FlipaClip / PENUP. Worth doing before you have real users to show it off to.
3. **Basic moderation/flagging** — needed before any stranger can see anyone else's posts.
4. **Backend + accounts** — the big lift. This is where the project stops being a client-only prototype and needs real infrastructure; happy to help scope this when you get here.
5. **Social layer** — likes, comments, discovery.
6. **Resume visual polish** — Stage 2 redesign.
7. **Launch prep** — final icons, store listings if you go native, privacy policy.
