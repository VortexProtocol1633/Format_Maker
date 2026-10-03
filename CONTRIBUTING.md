# Contributing to Format_Maker

Thanks for taking the time to help. This is a small, dependency-free static web app,
so contributing is mostly a matter of editing plain HTML, CSS, and JavaScript.

## Getting set up

There's no build step. Clone the repo and serve the root directory:

```bash
git clone https://github.com/VortexProtocol1633/Format_Maker.git
cd Format_Maker
python -m http.server 8000
```

Then open <http://localhost:8000>.

Please use a local server rather than opening `index.html` directly — browsers block
`fetch()` on `file://`, which stops the bundled demo templates in `templates/` from loading.

## Project conventions

- **No framework, no bundler.** The app is ES modules loaded natively by the browser.
  Please don't introduce a build step or a framework dependency.
- **One module, one responsibility.** `state.js` owns the data; `renderer.js`, `modal.js`,
  `exporter.js`, and the rest read from it or call its methods. Keep that direction of
  dependency — UI modules should not mutate `state` properties directly.
- **Escape anything untrusted.** Content coming from a user or a scanned document is
  injected with `escapeHtml()` (or built via `textContent`). Please keep it that way —
  see `js/util.js`.
- **Keep document typography separate from UI typography.** The app chrome uses Poppins
  via `--ui-font`; form blocks carry their own font and must not inherit the UI face.
  Adding a `font-family` rule to `*` would break exported documents — this is called out
  in `style.css` for a reason.
- **Use the design tokens.** Prefer `--accent`, `--radius-*`, and the existing glass
  classes over hard-coded colours, so the accent themes keep working.

## Before you open a pull request

- [ ] The change works in a current Chrome, Firefox, and Safari.
- [ ] Light and dark mode both look right.
- [ ] Keyboard navigation still works, and dialogs still trap focus and close on <kbd>Esc</kbd>.
- [ ] If you touched export or scanning, spot-check the output in the target format.
- [ ] No new console errors.

If you added or changed a CDN library, please keep the fallback-mirror pattern in
`index.html` so the app still degrades gracefully offline.

## Reporting bugs

Please open an issue and include:

- what you did, what you expected, and what happened instead,
- your browser and operating system,
- a screenshot if the problem is visual.

## Code of conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).