# Handover: Browser-based speaker design tools

## Goal

Build free, browser-based loudspeaker design tools for DIY builders, inspired by the late Jeff Bagby's Excel tools (Passive Crossover Designer, Diffraction Tool, Woofer Box & Circuit Designer). They will live on audiomission.co.uk, alongside my speaker build write-ups.

Why: Jeff's tools are Excel/VBA spreadsheets (macros now blocked by default, poor on Mac and web Excel), and the modern alternatives (WinPCD, VituixCAD, XSim, Basta!) are all Windows desktop apps. Nothing comparable runs in a browser.

## Permission and attribution (important)

- Charlie Laub, who hosted Jeff's tools for years, replied on diyAudio: I'm welcome to copy the intent and use the ideas and concepts from Jeff's work, as long as I'm not directly copying or profiting from his programs. He suggested crediting Jeff as the inspiration.
- Therefore: **write everything from scratch from the published maths and physics. Do not port, copy or reproduce Jeff's spreadsheets, code, formulas-as-implemented, layouts or UI.**
- Keep the tools free.
- Each tool and the site should credit Jeff Bagby as the inspiration, e.g. "Inspired by the work of the late Jeff Bagby, whose free design tools helped a generation of DIY speaker builders."

## Scope

Start small and get one tool genuinely good before moving on.

1. **Baffle diffraction / baffle step modeller.** Charlie pointed to the Vanderkooy edge-diffraction method that Jeff used. VituixCAD and Basta! are the modern references to validate against.
2. **Box modeller.** Sealed, vented and passive-radiator alignments from Thiele-Small parameters, including driver + box response, port/PR tuning and excursion.
3. **Later, maybe:** passive crossover simulation from imported .frd (frequency/phase) and .zma (impedance) measurement files, with summed response and off-axis/power response. This is a big job; don't start it until 1 and 2 are solid.

## Requirements

- **Fully client-side.** All calculation in the browser. No server, no uploads, no accounts.
- **PWA** (suggested by a diyAudio member): installable, works offline via a service worker caching the app shell.
- **Local storage of projects.** Originally specced as IndexedDB; built as a localStorage-based
  named-project library instead (see Decisions below) once it became clear a single autosave
  slot plus file export wasn't actually meeting this - a user testing the deployed site pointed
  out it was effectively one-shot per tool.
- **File import/export:** .frd/.zma measurement files, plus a project file format (JSON) so people can back up, share and move designs between devices.
- **Works on any OS**, desktop and mobile, light and dark mode.
- **Validation:** check results against known-good tools (VituixCAD, WinPCD, Basta!) and published examples. Accuracy matters more than features; this audience will check.

## Stack and code style

- **RE:DOM** for UI, used in the classic RE:DOM style so the code stays familiar to me.
- **Pico CSS** for styling.
- **Native browser features and components** wherever possible.
- **Minimal dependencies.** I've had maintenance nightmares from piling on libraries. Justify any library before adding it (a charting library is probably the one reasonable exception; discuss options first).
- Plain JavaScript is fine; my main languages are C# and JavaScript.

## Context

- diyAudio thread (Software Tools subforum) asking whether the tools would be useful got positive replies.
- My own builds include Jeff's Kairos with his bass modules, so test cases using sealed and passive-radiator designs are directly useful to me. Driver + passive radiator datasheets (SB29SWNRX-S75-6, SB29NRX-00) and Jeff's own Kairos/Continuum write-up (with published Vb=48L sealed/vented/PR results to validate against) are in the repo root.
- See also `DIFFRACTION-NICE-TO-HAVE.md` (diffraction tool extras) and `ROADMAP-IDEAS.md` (workflow wizard, cabinet designer — post-MVP ideas).

## Decisions

- **Hosting:** separate repo (this one), deployed via GitHub Pages at `tools.audiomission.co.uk`
  (subdomain, not a subpath of the main site), linked from the main site's nav. The main
  `audiomission.co.uk` site (github.com/data-handler/audio-mission) is a hand-written static
  HTML site with no build step, also on GitHub Pages — keeping this repo separate decouples
  the growing JS app (service worker, IndexedDB, vendored libs) from that hand-edited content.
- **Charting:** [uPlot](https://github.com/leeoniya/uPlot) — tiny, canvas-based, built for
  log-frequency-axis multi-trace plots. The justified library exception.
- **Project file format:** JSON with a top-level `schemaVersion` (independent of app version)
  and a `kind` discriminator (e.g. `"diffraction"`, `"box"`). Add a migration function per tool
  whenever the schema changes; never delete an old migration step.
- **License:** MIT, matching the main site.
- **Styling:** dropped Pico CSS (originally listed under Stack and code style above) in favour
  of a small hand-written design system (`css/app.css`) once the UI needed to carry real
  information density (grouped Thiele-Small inputs, inline help, a computed-result readout)
  that a generic component library wasn't shaped for. Palette and type are drawn from the
  hardware itself (plywood, brass terminals, meter dials) rather than a generic theme;
  self-hosted JetBrains Mono + Public Sans.
- **Service worker caching:** HTML page navigations are network-first (falling back to the
  cache only when offline); everything else (JS/CSS/fonts/vendor libs) stays cache-first,
  since those are already cache-busted by `CACHE_NAME` and cache-first is what makes the app
  usable offline. A plain cache-first navigation strategy meant a new deploy (e.g. a new
  tool's card added to the homepage) could sit behind a page's own in-app links indefinitely,
  invisible until a hard reload — reported directly by a user testing a deploy, reproduced
  and confirmed fixed with a scripted test before shipping (see the commit for a from-scratch
  repro: simulate an old cached shell, change the on-disk HTML without touching the service
  worker, then check whether a normal in-app link navigation picks up the new content). Still
  wasn't enough on its own: browsers don't reliably re-check `service-worker.js` itself for
  changes on every navigation (it's throttled, effectively up to 24h), so even with the HTML
  fetch fixed, the JS/CSS a freshly-fetched page asks for could still come from an old,
  still-active worker's cache - `src/register-sw.js` now calls `registration.update()` on
  every page load and whenever the tab regains focus, forcing that check rather than waiting
  for the browser's own schedule. Confirmed with a scripted repro too: deploy a new
  `service-worker.js` on disk without reloading, then check that clicking between two in-app
  pages (not a reload) picks it up.
- **Saved-projects library:** localStorage rather than IndexedDB (`src/project-library.js`,
  shared UI in `src/project-library-panel.js`). This project already uses localStorage
  everywhere else with no prior IndexedDB code to build on, and the data (plain-text project
  JSON, including any embedded `.frd`/`.zma` measurement text) is nowhere near localStorage's
  several-MB-per-origin ceiling even with a sizeable library — IndexedDB's async, transactional
  API is more surface area to get right for a feature whose whole point is not losing someone's
  work. Sits on top of each tool's existing single-slot autosave (kept as-is, as the safety net
  that restores in-progress work on reopening a tab) rather than replacing it.

## Progress

- **Baffle diffraction (item 1):** working. Vanderkooy edge-source model, validated with a
  `node:test` suite against known closed-form results, live chart, JSON project export/import.
- **Box modeller (item 2):** sealed box is complete (response + cone excursion, both
  validated). Vented box is now complete too: response validated against the standard
  4th-order Butterworth filter coefficients independent of Small's own paper, and cone
  excursion (no published closed-form found, so validated instead against three physical
  facts — converges exactly to the sealed-box excursion at high frequency, sharp minimum at
  Fb, steep rise below Fb — see the module comment in `src/vented-box.js`).
  **Passive-radiator alignment: parked, not implemented.** From-scratch circuit derivation
  confirmed correct for the sealed-box case (matches the validated module to 0.0002 dB) and
  the PR's own component conversion is right (reproduces its 10.2 Hz datasheet resonance from
  first principles), but the full coupled driver+box+PR system doesn't reproduce Jeff's
  published real-world result (48 L box tuning to Fb=17.1 Hz, F3=36 Hz) — tried the natural
  analogue of Small's sealed-box Fc formula (radiator mass against box+own compliance in
  series) and landed close on Fb (15.75 Hz) but the predicted F3 was off by a wide margin
  (~50 Hz vs. 36 Hz), so it's not just a close-enough approximation. The actual primary
  source (R. Small, "Passive-Radiator Loudspeaker Systems" Parts 1 & 2, JAES 1974) is paywalled
  in the AES E-Library and wasn't accessible. Revisit if/when the papers or a trustworthy full
  reproduction of them turns up.
- **Passive crossover simulation (item 3): started.** Core maths is in place and validated:
  `.frd`/`.zma` file parsing (`src/measurement-import.js`), log-frequency resampling of
  measured data onto a common grid (`src/resample.js`), and a two-port (ABCD matrix) network
  solver for series/shunt R-L-C ladder networks (`src/crossover-network.js`) — checked against
  textbook closed-form filter responses (a plain voltage divider, a first-order RC low-pass,
  and a second-order Butterworth L-C low-pass matched point-for-point against its exact
  `1/(1+(f/fc)^4)` formula across the full audio band), not just spot-checked. `src/complex.js`
  is a shared complex-number module (vented-box.js's excursion maths imports from it too,
  rather than keeping its own copy). The project file format (v2) supports any number of
  drivers, each with its own measurement, crossover network, level trim, acoustic
  offset (mm, converted to a phase delay) and polarity invert; `src/driver-combine.js`
  applies those and sums the drivers' complex responses into the modelled acoustic total —
  validated against known facts (two in-phase identical sources sum to +6.02 dB, an inverted
  identical pair cancels to silence, a one-period delay is equivalent to no delay). The UI
  shows each driver's own response plus the summed total on one chart, with v1 (single-driver)
  project files still opening via a migration. Each driver also has a "quick filter" helper
  (`src/crossover-presets.js`) that fills in standard 1st-, 2nd-, 3rd- or 4th-order component
  values for a given crossover frequency, derived from the filter's own transfer function
  rather than a published table (those are almost always for a doubly-terminated filter,
  which a voltage-source-driven passive crossover is not). 2nd order offers Butterworth
  (Q=0.707) or Linkwitz-Riley (Q=0.5); 3rd and 4th order are solved by matching the ladder's
  ABCD-derived denominator polynomial term-by-term against the standard normalized
  Butterworth polynomial for that order (Linkwitz-Riley isn't offered past 2nd order — it's
  only defined at even orders as the square of a half-order Butterworth response, and
  whether/how that's realizable as a single passive ladder hasn't been worked out). All
  orders checked against the exact closed-form Butterworth response
  (`1/(1+(f/fc)^(2*order))`) to floating-point precision, and Linkwitz-Riley additionally
  against its defining property (low-pass and high-pass are both exactly -6.02dB at the
  crossover frequency, and sum to an exactly flat response at every frequency once one
  driver's polarity is inverted — confirmed algebraically that this exact cancellation is
  unique to Q=0.5 before relying on it as a test). Each driver can also take
  off-axis measurements (any number of extra `.frd` files, each tagged with its angle) and
  shows its own family of angle responses plus an estimated power response
  (`src/directivity.js`) — a solid-angle-weighted energy average over the measured angles
  (weights from the standard spherical-zone area formula, not a naive equal- or
  sin(theta)-per-point average), assuming the driver is axisymmetric and that only the front
  hemisphere (0-90°) matters, so it's a directivity/early-reflections estimate, not a
  lab-grade full-sphere sound-power measurement. There's also a system-level version that
  combines every contributing driver's off-axis family into one chart, even when drivers
  weren't measured at the same angles: the target angle set is the union of every driver's
  own angles, and at each one a driver that wasn't measured there stands in its own nearest
  measured angle instead of being interpolated (`nearestAngleIndex` — chosen over
  interpolating the complex response, which risks distorting phase near a directivity null);
  a driver with no off-axis measurements at all is assumed not to change with angle. This
  closes out the crossover simulator's scope from item 3 above — off-axis/power response,
  multi-driver summing and filter presets are all in now, at the level of rigour this project
  asks for; further polish (more alignments, interpolation instead of nearest-angle, etc.)
  can be revisited with real-world use.
- **Saved-projects library:** all three tools now have a proper Save / Save as new /
  Open ("Revert to saved" when the opened entry is already current) / Delete / New flow
  against a named-project library (see Decisions above), not just the one autosave slot
  each tool already had. Caught and fixed, via testing a driver-count-changing "revert",
  a real latent bug in the crossover tool predating this feature: `renderDrivers()` and
  `rebuildChart()` were called in the wrong order in three places (add driver, remove driver,
  apply an imported/reverted project) — a driver card's directivityEditor triggers the global
  `recompute()` once at construction, so if the driver count had already changed but the
  chart's own series config hadn't been rebuilt yet, a crash was possible (reliably so when
  the driver count went down, silently wrong - self-corrected a moment later - when it went
  up). Fixed both by correcting the call order and by making `recompute()` itself skip a
  round when the chart's series count doesn't match the current driver count, rather than
  only patching the specific call sites that happened to be exercised by testing.
  Placement and labelling were revised twice after direct feedback that it was confusing.
  First: "Saved projects" sat between the editable fields and the charts, and even moved next
  to Project name it still read as two competing, unexplained "naming" surfaces stacked on
  top of each other. Second, sharper piece of feedback: a *saved* design already has its own
  name, so leading with a name field and only mentioning "or open one" as an afterthought had
  the order backwards - opening one replaces that name (and everything else) anyway, so
  naming only applies to the "keep working on this one" path, not before you've even chosen
  that path. `src/project-library-panel.js` now owns the project name field directly (passed
  in as `nameInput` rather than each tool rendering it separately) and orders itself
  accordingly: open a saved design first (collapsed-by-default `<details>` list, so it doesn't
  compete for attention), *then* - as a clearly separate, later step - name and save the one
  you're currently working on.
