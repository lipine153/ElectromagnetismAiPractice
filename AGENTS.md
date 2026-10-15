# AGENTS.md

Electromagnetism teaching site ("电磁学闯关游戏"): a quiz page + a Three.js/Wasm magnetic
field-line viewer. Front end is **Vite + TypeScript + Tailwind v4** (bun-managed); the only
C++ build is the Wasm module. No tests, no CI.

## Commands
```
bun install
bun run dev          # Vite dev server (http://localhost:5173)
bun run build        # tsc --noEmit && vite build -> dist/
bun run preview      # preview dist/
bun run typecheck    # tsc --noEmit only
pwsh -File scripts/build.ps1   # rebuild C++ -> public/bin/field_line.js
```
- **bun is not on PATH by default** — run `pineload bun` first (`pineload` =
  `D:\Dev\Tools\pine\pineload.ps1`, a user-level env manager).
- `scripts/build.ps1` activates the toolchain via `pineload cmake` + `pineload emcc`
  (Emscripten 6.0.0, CMake 4.4.2, Ninja 1.13.2). `emcc`/`make` are not on PATH by default.
  C++ config lives in `CMakeLists.txt`; Eigen default `D:/Dev/Lib/cpp/eigen-5.0.0`
  (override with `-EigenDir` / `-DEIGEN_DIR`).
- **`file://` no longer works**: local ES modules + local three.js are blocked by CORS.
  Always open via `bun run dev` (or `preview`, or any http server).
- `vite.config.ts` sets `server.host = '::'` on purpose: this machine's Vite otherwise bound
  IPv6-only (`::1`) and the browser's `localhost` (resolved to `127.0.0.1`) got "connection
  refused". Binding `::` is dual-stack, so both `localhost` and `127.0.0.1` work.

## Layout
- `index.html` — Three.js magnetic-field viewer, the **default entry** (served at `/`);
  `quiz.html` — the quiz. Both are Vite MPA entries; logic lives in the `src/*.ts` they load.
- `src/simulate.ts` — viewer entry; `src/quiz.ts` — quiz entry.
- `src/game/` — `levels.ts` (level data + `ModelKind`), `state.ts` (score/level/timer store),
  `render.ts` (DOM), `quiz.ts` (controller).
- `src/models/index.ts` — per-model inline **SVG** diagrams (keyed by `ModelKind`).
- `src/styles/app.css` — the single design-token source (`@theme`) + all components.
- `src/types/field_line.d.ts` — global `FieldLineModule` typing for the Wasm glue.
- `cpp/` — Wasm source (`field.cpp` = the field to swap, `integrator.cpp`, `bindings.cpp`).
- `public/bin/field_line.js` — committed Wasm glue; copied into `dist/` by Vite.
- `build/`, `dist/`, `node_modules/` — gitignored.

## Conventions / gotchas
- Editing a level = editing `levels.ts`; its `model` must match a key in
  `src/models/index.ts` (`ModelKind` union makes a mismatch a type error).
- Text with math renders through KaTeX. The question and the slot labels are plain text that
  contains `\(..\)` / `\[..\]` delimiters and go through `renderMath` (auto-render); they are
  written with `textContent`, so a literal `<` is fine — don't switch to `innerHTML`.
- Diagram labels (`src/models/index.ts` → `label.tex`) are **bare LaTeX** (no delimiters) and
  are rendered with `renderTex` (direct `katex.renderToString`), *not* auto-render.
- Styling: use Tailwind utilities + the tokens in `src/styles/app.css`. **Never hardcode
  colors/spacing/z-index** — add a token instead (that was the point of the refactor).
- Quiz interaction is **click-to-place** (click a number chip, then a slot; click a filled
  slot to clear), not drag-and-drop — this works on touch.
- Dependencies are local npm packages (no CDN, no `polyfill.io`); icons are inline SVG,
  KaTeX/three bundle through Vite.
- Wasm contract (keep in sync with `simulate.ts` / `CMakeLists.txt`): exports `_malloc`,
  `_free`, `_traceFieldLine`, `_freeFieldLine`, runtime `getValue`, global `FieldLineModule`;
  `_traceFieldLine` returns `4 * pointCount` floats per point `[x, y, z, |B|]`, count via an
  out-param. Built with `-sSINGLE_FILE=1` (wasm embedded in the `.js`).
- No automated tests. Verify UI by loading the dev server in a browser; verify Wasm by
  requiring `public/bin/field_line.js` in Node and calling `_traceFieldLine`.
