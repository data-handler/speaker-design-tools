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

## Structure

- `index.html` — landing page / tool index
- `tools/<tool-name>/` — one self-contained page + script per tool
- `vendor/` — vendored third-party libraries (RE:DOM, Pico CSS), committed
  directly so the PWA app shell works fully offline with no build/bundle step
- `src/register-sw.js` — shared service worker registration
- `service-worker.js` — app-shell cache-first service worker
- `manifest.json` — PWA manifest

## Stack

- [RE:DOM](https://redom.js.org/) for UI, in the classic `el`/`mount` style
- [Pico CSS](https://picocss.com/) for styling (light/dark via
  `prefers-color-scheme`, no JS required)
- Plain JavaScript, ES modules, no bundler
- IndexedDB for local project storage; JSON export/import as the portable
  backup/share format (see `HANDOVER.md` for the project file schema approach)

## Deployment

Hosted on GitHub Pages at `tools.audiomission.co.uk` (see `CNAME`).
