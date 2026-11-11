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
- **Local storage of projects** in IndexedDB.
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
  is a new shared complex-number module (vented-box.js's excursion maths now imports from it
  too, rather than keeping its own copy). The crossover tool UI handles one driver so far:
  import its `.frd` (and optionally `.zma`, falling back to a flat nominal impedance if not
  given), build a component list, see the raw vs. filtered response. Still to do: summing
  multiple drivers with level and time/phase alignment, off-axis/power response, and a
  friendlier way to build common filter orders/topologies than entering components one by one.
