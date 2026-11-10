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
- My own builds include Jeff's Kairos with his bass modules, so test cases using sealed and passive-radiator designs are directly useful to me.

## Decisions

- **Hosting:** separate repo (this one), deployed via GitHub Pages at `tools.audiomission.co.uk`
  (subdomain, not a subpath of the main site), linked from the main site's nav. The main
  `audiomission.co.uk` site (github.com/data-handler/audio-mission) is a hand-written static
  HTML site with no build step, also on GitHub Pages — keeping this repo separate decouples
  the growing JS app (service worker, IndexedDB, vendored libs) from that hand-edited content.
- **Charting:** [uPlot](https://github.com/leeoniya/uPlot) once a tool needs charts — tiny,
  canvas-based, built for log-frequency-axis multi-trace plots. The justified library exception.
- **Project file format:** JSON with a top-level `schemaVersion` (independent of app version)
  and a `kind` discriminator (e.g. `"diffraction"`, `"sealed-box"`). Add a migration function
  per tool whenever the schema changes; never delete an old migration step.
- **License:** MIT, matching the main site.

## Progress

- **Baffle diffraction (item 1):** working. Vanderkooy edge-source model,
  validated with a `node:test` suite against known closed-form results, live
  chart, JSON project export/import.
- **Box modeller (item 2):** sealed box is complete (response + cone
  excursion, both validated). Vented box response is complete and validated
  (including a cross-check against the standard 4th-order Butterworth filter
  coefficients, independent of Small's own paper). Still to do: vented-box
  cone excursion (needs its own transfer function, not yet derived/verified
  with enough confidence to ship), and passive-radiator alignment (not
  started).
- **Passive crossover simulation (item 3):** not started, per the stated plan.
