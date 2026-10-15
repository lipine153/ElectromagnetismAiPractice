# AGENTS.md

Electromagnetism teaching site: an interactive 3D field sandbox (`index.html`, the default
entry) plus a quiz (`quiz.html`). Front end is **Vite + TypeScript + Tailwind v4**
(bun-managed); the physics core is **C++ compiled to Wasm** via Emscripten. No tests, no CI.

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
  (Emscripten 6.0.0, CMake 4.4.2, Ninja 1.13.2). `emcc` is not on PATH by default. Build
  config is `CMakeLists.txt`; there is **no Eigen dependency** (plain `cpp/include/vec3.hpp`).
- `vite.config.ts` sets `server.host = '::'` on purpose: this machine's Vite otherwise bound
  IPv6-only (`::1`) and the browser's `localhost` got "connection refused".
- **`file://` does not work**: local ES modules are blocked by CORS, and the separate
  `field_line.wasm` cannot be fetched over `file://` either. Always use `bun run dev`
  (or `preview`, or any http server).

## Layout
- `index.html` — 3D field sandbox shell (top bar, collapsible drawer). `quiz.html` — the quiz.
- `src/simulate.ts` — sandbox entry (assembly). `src/quiz.ts` — quiz entry. `src/main.ts` is gone.
- Sandbox modules:
  - `src/scene/` — `types.ts` (Vec3 / ElementKind / SceneElement), `catalog.ts` (palette +
    param specs), `store.ts` (single state source).
  - `src/physics/` — `wasm.ts` (the ONLY place that talks to Wasm), `seeds.ts` (seed points).
  - `src/render/` — `scene3d.ts`, `elements3d.ts` (meshes + TransformControls), `fieldLines.ts`,
    `colors.ts`.
  - `src/ui/` — `toolbar.ts`, `panel.ts`.
- `src/game/`, `src/models/` — quiz logic and its inline SVG diagrams.
- `src/styles/app.css` — the single design-token source (`@theme`) + all components.
- `cpp/` — `vec3.hpp` (minimal vector math), `source.hpp` (source kinds/encoding),
  `field.cpp` (field superposition per kind), `integrator.cpp` (RK4 + tracing),
  `bindings.cpp` (C ABI).
- `public/bin/` — committed Wasm build output: `field_line.js` (glue) + `field_line.wasm`.
- `build/`, `dist/`, `node_modules/` — gitignored.

## Sandbox architecture (phase 0: electrostatics only)
`SceneStore.elements[]` → packed into doubles → `_set_sources` → C++ sums E/B at any point →
`seeds.ts` generates seed points → `_trace_lines` → three.js `Line2` groups (one for E, one
for B). Field lines are retraced at ~15fps while the scene changes, never per frame at 60fps.
Phases still to come: magnetostatics, induction, displacement current.

## C++ ↔ JS contract (keep both sides in sync)
- **Source encoding**: flat `double[]`, `kSourceStride = 12` per source:
  `kind, pos(3), dir(3), vel(3), p0, p1`. Kind codes and what `p0`/`p1` mean live in
  `cpp/include/source.hpp`; the TS side mirrors them in `src/scene/types.ts` (`SOURCE_KIND`)
  and `src/physics/wasm.ts` (`packParams`).
- **Seed encoding** for `_trace_lines`: flat `double[]`, stride 4 = `[x, y, z, sign]`
  (`sign < 0` traces against the field, used to draw lines arriving at negative charges).
- **Exports** (set in `CMakeLists.txt`): `_malloc`, `_free`, `_set_sources`, `_trace_lines`,
  `_eval_field`; runtime method `getValue`; module global `FieldLineModule`.
- `_trace_lines(...)` returns a pointer to a **persistent internal buffer** (reused every
  call — do not free it). Layout: `[count, (x,y,z,|F|) x count]` per seed, concatenated.
- **After any call that may grow memory you must re-read `module.HEAPF32` / `HEAPF64`** —
  `ALLOW_MEMORY_GROWTH=1` replaces the views. Never cache them.
- The build emits **two sibling files**: `field_line.js` + `field_line.wasm`. The glue locates
  the wasm through `locateFile` relative to its own URL, so both must be committed and served
  together. Streaming compile needs `Content-Type: application/wasm` (Vite dev/preview send
  it); plain static servers may fall back to ArrayBuffer instantiation, which still works.

## Verifying the Wasm from Node
`package.json` has `"type": "module"`, so Node treats the CJS-style glue as ESM and
`require('public/bin/field_line.js')` returns `{}`. Load it manually instead:
```js
const src = fs.readFileSync('public/bin/field_line.js', 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', '__dirname', '__filename', src)(
  mod, mod.exports, require, dir, dir + '/field_line.js');
const factory = mod.exports;      // then: factory().then(wasm => ...)
```
The glue reads `field_line.wasm` from the directory you pass as `__dirname`, so pass the real
`public/bin` path (or the process will fail to load the binary).
Sanity check after a rebuild: one `+1e-9 C` charge at the origin → `_eval_field(1,0,0)` gives
`|E| = 8.987552` (Coulomb), and `_trace_lines` returns ~197 points per line.

## Adding a new element kind
1. `cpp/include/source.hpp`: add a `SourceKind` code and document `p0`/`p1`.
2. `cpp/src/field.cpp`: add a `case` in `evalE`/`evalB`. Then `pwsh -File scripts/build.ps1`.
3. `src/scene/types.ts`: add the key to `SOURCE_KIND`; `src/physics/wasm.ts`: add the
   `packParams` case; `src/scene/catalog.ts`: add a palette entry + param specs.
4. `src/render/elements3d.ts`: `createMesh` currently always makes a sphere — branch on kind.

## Conventions / gotchas
- Styling: use Tailwind utilities + the tokens in `src/styles/app.css`. **Never hardcode
  colors/spacing/z-index** — add a token instead. Field-line ramps live in `src/render/colors.ts`
  and must stay in sync with the `.legend__bar--*` gradients in `app.css`.
- UI text and code comments are Chinese; keep new user-facing strings Chinese.
- Quiz: editing a level = editing `src/game/levels.ts`; its `model` must match a key in
  `src/models/index.ts`. Question/slot text goes through KaTeX via `textContent` (a literal
  `<` is fine); diagram labels are **bare LaTeX** rendered with `renderTex`, not auto-render.
- `TransformControls` (three r186) must be added to the scene via `transform.getHelper()`,
  and `dragging-changed` is what disables `OrbitControls` while dragging.
- No automated tests. Verify UI in a browser; verify Wasm with the Node snippet above.
