# Speaker Design Tools

Free, browser-based loudspeaker design tools for DIY builders, inspired by the
late Jeff Bagby's Excel tools. Written from scratch from published maths and
physics — see [HANDOVER.md](HANDOVER.md) for full background, scope and the
attribution agreement this project operates under.

## Running locally

No build step. Any static file server works, e.g.:

```sh
npx serve .
```

Service workers require a real origin (not `file://`), so always view the
site through a local server, not by opening `index.html` directly.

## Testing

Calculation code (`src/*.js`) has a `node --test` suite validating it against
known closed-form results (e.g. the -6.02 dB low-frequency baffle-diffraction
limit), not just against other tools, so regressions are caught automatically:

```sh
npm test
```

## Structure

- `index.html` — landing page / tool index
- `tools/<tool-name>/` — one self-contained page + script per tool
- `src/<tool-name>.js` — that tool's pure calculation code, unit-tested
  independently of its UI (e.g. `src/diffraction.js`)
- `vendor/` — vendored third-party libraries (RE:DOM, Pico CSS, uPlot),
  committed directly so the PWA app shell works fully offline with no
  build/bundle step
- `src/register-sw.js` — shared service worker registration
- `service-worker.js` — app-shell cache-first service worker
- `manifest.json` — PWA manifest
- `test/` — `node --test` suites for the calculation code

## Stack

- [RE:DOM](https://redom.js.org/) for UI, in the classic `el`/`mount` style
- [Pico CSS](https://picocss.com/) for styling (light/dark via
  `prefers-color-scheme`, no JS required)
- [uPlot](https://github.com/leeoniya/uPlot) for charts
- Plain JavaScript, ES modules, no bundler
- Each tool currently persists its current design to `localStorage` and
  supports JSON export/import for backup/sharing (see `HANDOVER.md` for the
  project file schema approach); multi-project storage in IndexedDB is a
  planned follow-up once there's more than one tool to store projects for

## Deployment

Hosted on GitHub Pages at `tools.audiomission.co.uk` (see `CNAME`).
