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
bun run build:offline  # 单文件离线版 -> dist-offline/（双击即用，可直接发给别人）
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
    param specs), `store.ts` (single state source), `geometry.ts` (wire → straight segments),
    `ops.ts` (node add/remove).
  - `src/physics/` — `wasm.ts` (the ONLY place that talks to Wasm), `seeds.ts` (seed points).
  - `src/render/` — `scene3d.ts`, `elements3d.ts` (meshes + TransformControls),
    `wireView.ts` (conductor + node handles + current arrows), `fieldLines.ts`, `colors.ts`.
  - `src/ui/` — `toolbar.ts`, `panel.ts` (two tabs), `contextMenu.ts` (menu host),
    `elementMenu.ts` (shared menu content), `params.ts` (shared slider control).
- `src/game/`, `src/models/` — quiz logic and its inline SVG diagrams.
- `src/styles/app.css` — the single design-token source (`@theme`) + all components.
- `cpp/` — `vec3.hpp` (minimal vector math), `source.hpp` (source kinds/encoding),
  `field.cpp` (field superposition per kind), `integrator.cpp` (RK4 + tracing),
  `bindings.cpp` (C ABI).
- `public/bin/` — committed Wasm build output: `field_line.js` (glue) + `field_line.wasm`.
- `build/`, `dist/`, `node_modules/` — gitignored.

## Sandbox architecture (phase 2: electrostatics + a current-carrying wire)
`SceneStore.elements[]` → packed into doubles → `_set_sources` → C++ sums E/B at any point →
`seeds.ts` generates seed points → `_trace_lines` → three.js `Line2` groups. Field lines are
retraced at ~15fps while the scene changes, never per frame at 60fps. Still to come: induction,
displacement current.

**The wire (`straightWire`) is the only non-point element.** C++ knows nothing about polylines:
`src/scene/geometry.ts` expands a wire element into plain **finite straight segments** (one C++
source each, `p0 = I`, `p1 = length`). The rules:
| case | expansion |
|---|---|
| open, N nodes | each segment, **plus** a semi-infinite segment off each end (just a huge `p1`) |
| closed, 2 nodes | circle whose diameter is the node pair, discretised into 32 segments |
| closed, >2 nodes | the polygon segments plus a closing last→first segment |

E/B seeds are built separately (`buildSeeds` for charges, `buildWireSeeds` for wires); the
top-bar 线密度 slider drives both.

Wire gotchas:
- **Node handles must map to `element.nodes`, never to the rendered centreline points.** A
  closed 2-node circle renders 33 centreline points but has only 2 real nodes — indexing
  handles off the centreline made "delete node 2" remove node 1.
- Whole-wire translate and loop rotate are driven by **invisible proxy objects** (the
  TransformControls target), so the transform is never fought over or reset mid-drag.

Field-line gotchas (each of these was got wrong once already):
- **Seeding**: every charge gets seed points and is traced *outward* by its own sign (positive
  forward, negative reverse). Seeding only positive charges made the two ends look asymmetric.
  The seed directions come from `DENSITY_LEVELS` in `seeds.ts` — **geodesic subdivisions of the
  icosahedron** (12 / 42 / 92 directions), which is what the top-bar 线密度 discrete slider
  picks between. Every level is closed under x→−x / y→−y / z→−z, so the symmetry property is
  kept as density grows. An evenly-spread but *asymmetric* set (Fibonacci sphere) made a
  symmetric dipole render lopsided — measured: only 4/24 directions had a mirror partner and
  0/24 traced curves paired.
- **Strength encoding**: one **global** log colour scale per field, spanning an adaptive 2–4
  decades of the scene's actual `|F|` range — never per-line normalisation, which makes every
  line span the whole ramp and hides the differences. On top of the colour, `fieldLines.ts`
  splits each polyline into 3 strength buckets drawn with different width/opacity
  (`BUCKETS`), which is what actually makes strong vs weak obvious at a glance.
- **Direction arrows**: one `InstancedMesh` of small cones per field, placed every
  `ARROW_SPACING` world units along each polyline and coloured by the same ramp. This depends
  on C++ emitting every polyline **in field direction** — `integrator.cpp` reverses the point
  order for reverse-traced (negative-charge) lines. Do **not** set `vertexColors` on the arrow
  material: `instanceColor` enables `USE_INSTANCING_COLOR` by itself, whereas `vertexColors`
  would require a `color` attribute that `ConeGeometry` does not have. The top-bar toggle just
  flips `SceneStore.showArrows` → `FieldLines.setArrowsVisible()` (no retrace needed).

## Sandbox UI conventions (keep this feel — don't drift)
The sandbox stays **minimal**: full-screen scene, one slim top bar, one collapsible left
drawer. No permanent side panels, no wall of buttons ("中药铺"). If a new control affects the
whole scene it goes in the top bar (field mode, 方向箭头, 线密度); anything per-element stays in
the drawer or the context menu.
- **Everything is selectable.** Click or right-click an element to select it; the selection
  drives both the drawer's properties section and the `TransformControls` gizmo. A newly added
  element is selected automatically.
- **Right-click is the main editing surface** (`src/ui/contextMenu.ts` + `elementMenu.ts`): on
  empty ground it offers the palette and spawns the new element *under the cursor*; on an
  element it offers that element's parameters plus 删除; on a wire node it offers insert/delete
  node. Any new element kind must work through every path.
- **The drawer's 工作 tab is the scene outliner**: one row per element with an **E/B badge**
  (`elementDomain`) + colour dot + label, both mouse buttons open the same menu, and an
  「添加新要素」 button at the bottom. New elements are always independent elements — never
  append into an existing wire.
- **Edit in place.** Parameter sliders live both in the context menu and in the properties panel
  — always reuse `createParamControl` (`src/ui/params.ts`) rather than hand-rolling a slider, so
  the value renders as LaTeX and stays in sync with the panel/title.
- **Numbers are typeset, not printed.** User-facing physical quantities render via KaTeX
  (`texValue` → `1.00\times10^{-9}\ \text{C}`), never `1.0e-9`.
- **Adding an element kind** = a `PALETTE` entry + `PARAM_SPECS` in `src/scene/catalog.ts`, a
  field `case` in `cpp/src/field.cpp`, and a mesh branch in `ElementViews.createMesh`. The
  drawer and the context menu pick it up automatically — don't special-case them.

## C++ ↔ JS contract (keep both sides in sync)
- **Source encoding**: flat `double[]`, `kSourceStride = 12` per source:
  `kind, pos(3), dir(3), vel(3), p0, p1`. Kind codes and what `p0`/`p1` mean live in
  `cpp/include/source.hpp`; the TS side mirrors them in `src/scene/types.ts` (`SOURCE_KIND`)
  and `src/physics/wasm.ts` (`packParams`). For `straightWire`, `pos` is the segment **start**,
  `dir` the unit direction and `p1` the length — its field is the analytic finite-segment
  Biot–Savart (see `cpp/src/field.cpp`); a huge `p1` is the "extends to infinity" idealisation.
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

## Offline single-file build
`bun run build:offline` (`scripts/build-offline.mjs`) produces `dist-offline/index.html` +
`dist-offline/quiz.html`, each **fully self-contained** (JS/CSS/woff2/wasm inlined) so they run
by double-click over `file://` with nothing installed — that is the "send it to someone" build.
Hard-won details if you touch that script:
- Fonts: only **woff2** is inlined; the woff/ttf sources are stripped (saves ~1 MB per page).
- The wasm is handed to the glue as `{ wasmBinary }` via `window.__FIELD_LINE_WASM__`, so
  nothing is fetched. `src/physics/wasm.ts` picks that global up when present.
- The entry script is built as an IIFE and **moved to just before `</body>`**. Vite puts it in
  `<head>` (a deferred module), but an inlined *classic* script in `<head>` runs before `<body>`
  exists, so `getElementById` returns null and the page dies instantly.
- **Use callback replacements** in `String.replace` when splicing content in. Minified JS/CSS
  contains `$&` / `$'` / `` $` ``, and the string form expands those — it silently duplicated
  the whole document into itself.
- Close any browser holding `dist-offline/` before rebuilding: Windows file locks make
  `rmSync` fail silently and the next build stacks on top of the old output.
- Page sizes: `index.html` ~1.25 MB (the sandbox properties panel renders values as LaTeX via
  KaTeX, so the sandbox page carries KaTeX + its woff2 fonts), `quiz.html` ~0.65 MB.

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
- Sandbox mouse mapping is **not** the OrbitControls default: **right = context menu**,
  middle = pan, left = rotate (`scene3d.ts`). `src/ui/contextMenu.ts` shows add-on-empty /
  delete-on-element, and new elements spawn at the ground point under the cursor
  (`ElementViews.pickGround`). Right-click always `preventDefault()`s the native menu. The menu
  also hosts the element's parameter sliders — the same control the properties panel uses
  (`createParamControl` in `src/ui/params.ts`), so a charge's value can be edited from either.
- No automated tests. Verify UI in a browser; verify Wasm with the Node snippet above.
