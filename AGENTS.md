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
    `wireView.ts` (conductor + node handles + current arrows), `fieldLines.ts`,
    `particleView.ts` (自由点电荷笔头 + 荧光笔拖尾), `colors.ts`.
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

**Solenoid** is expanded the same way: `solenoidLoops()` turns it into a stack of
`kCurrentLoop` sources. Because the loop count is capped (`MAX_SOLENOID_LOOPS`), each loop's
current is scaled by `(physical turns / modelled loops)` — otherwise the total ampere-turns
(and therefore `B = μ0 n I`) comes out wrong by that factor.

E/B seeds are built separately (`buildSeeds` for charges, `buildWireSeeds` for wires); the
top-bar 线密度 slider drives both.

Wire gotchas:
- **Node handles must map to `element.nodes`, never to the rendered centreline points.** A
  closed 2-node circle renders 33 centreline points but has only 2 real nodes — indexing
  handles off the centreline made "delete node 2" remove node 1.
- Whole-wire translate and loop rotate are driven by **invisible proxy objects** (the
  TransformControls target), so the transform is never fought over or reset mid-drag. Two
  things this got wrong once:
  - the rotate proxy's position is **midpoint of the two nodes** (= the circle's centre, since
    the node pair *is* the diameter). It used to be `midpoint(world[0], world[1])`, i.e. two
    *adjacent centreline samples* 11.25° apart, which put the gizmo out on the rim.
  - rotating a loop must be a **rigid rotation about that centre** (`geometry.rotateLoop`:
    both nodes *and* the normal turn together). Rewriting only the normal left the ring hinged
    on its fixed diameter — and a spin about the ring's own axis didn't move it at all. The
    handler feeds it the drag-start snapshot plus `Δ = q·q₀⁻¹` (TransformControls rotates in
    world space as `q = Δ·q₀`), never per-frame increments, so nothing drifts.
  - while `dragging`, `WireView.update` must **not** write the proxies back — TransformControls
    owns the transform for the duration.

Field-line gotchas (each of these was got wrong once already):
- **Seeding**: every charge gets seed points and is traced *outward* by its own sign (positive
  forward, negative reverse). Seeding only positive charges made the two ends look asymmetric.
  The seed directions come from `DENSITY_LEVELS` in `seeds.ts` — **geodesic subdivisions of the
  icosahedron** (12 / 42 / 92 directions), which is what the top-bar 线密度 discrete slider
  picks between. Every level is closed under x→−x / y→−y / z→−z, so the symmetry property is
  kept as density grows. An evenly-spread but *asymmetric* set (Fibonacci sphere) made a
  symmetric dipole render lopsided — measured: only 4/24 directions had a mirror partner and
  0/24 traced curves paired.
- **Magnetic seeds** (`buildMagneticSeeds`) have their own two traps: a solenoid is axisymmetric
  but that does *not* mean one meridian plane is enough — seeding in a single perpendicular
  direction put **every** line in one plane, so the seeds must be spread over several azimuths
  around the axis; and the point dipole has to use a **complete** direction set (`DENSITY_LEVELS`
  entry, not a strided subset), because a subset of a symmetric set is no longer symmetric.
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

## 自由点电荷（有质量的试探电荷）
A `freeCharge` element integrates `m·dv/dt = q(E + v·B)` in **C++** (`cpp/src/integrator.cpp`)
and draws a highlighter-green trail. The load-bearing decisions:

- **Boris push, not RK4.** RK4 makes the gyro-radius drift systematically (the orbit spirals
  in/out); Boris rotates the velocity *exactly* in the magnetic half-step, so `|v|` is conserved
  to machine precision under pure B (measured: 9e-15 over 100 orbits) and it is still 2nd order.
- **It is a test particle, so it must be excluded everywhere a source is assumed.** It is a real
  `ElementKind` (that is what gives it a 工作栏 row + the shared menu for free), but four places
  skip it: `wasm.ts upload` (not a source), `seeds.ts` (both builders), and
  `elements3d.createMesh/sync` (the visuals belong to `ParticleView`). Miss one and it either
  becomes a field source or grows a duplicate sphere.
- **Live state (pos/vel/trail) never enters the store.** Only config (`sign/qMag/m/v0/timeScale`)
  and the run state (`params.run`) live in `params`. If the position went through the store it
  would fire `retraceDirty` and rebuild every wire's LineGeometry at 60fps.
- **`distanceToNearestPointSource` is what the collision test must use** — `distanceToNearestSource`
  would treat a `kCurrentLoop`'s *centre* (and a wire's *segment start*) as solid, so a particle
  flying down a solenoid's bore would immediately "hit" the source.
- **Auto time-scale.** E-dominated and B-dominated scenes need frame steps three orders of
  magnitude apart, so a fixed `dt` is always wrong for one of them: at 放开 the code calibrates
  `physicalPerSecond` so one characteristic time (gyro period / E crossing / straight-line
  crossing, whichever is smallest) takes ≈2 s, then picks substeps from the *current* `|B|` and
  `|v|` (≤0.08 rad of gyration and ≤2% of the scene per substep, capped at 256).
- **Placement is two-phase**: place it like a point charge (spawns under the cursor, *held* and
  stationary), aim with the existing 移动/旋转 tools (its `direction` is v₀, and the preview
  arrow's length tracks `log10(v0)` so magnitude is visible too), then 放开 in the 工作 menu.
  Dragging is only allowed while held — dragging a flying particle would teleport it.
- **重置 must also clear the trail.** The trail is one polyline, so teleporting the head back to
  the start would draw a line across the scene that looks like a real teleport. 重置 bumps
  `params.trailSeq` (= clear) *and* sets `run=0`; 清除轨迹 only bumps the seq.

### Trail rendering: instanced cylinders, **not** Line2
The 3-layer glow stack (halo/body/core, additive, `depthTest:false` so it reads as a marker
drawn on top — which also fixes the trail z-fighting the ground grid, since an orbit can lie
exactly in the y=0 plane) is drawn with an `InstancedMesh` of unit cylinders, one instance per
segment (scaled to the segment length, colour faded toward the tail). **Do not "simplify" this
to `Line2`/`LineMaterial`:** that was the first implementation and it silently drew only ~1
segment (the geometry, `instanceCount` and materials all reported correct), which took a long
time to chase; the same instanced path the field-line arrows use works. Testing note: inside a
solenoid the trail is genuinely occluded by the coil from any shallow angle — orbit the camera
to look **down the bore** before concluding it is broken.

## Sandbox UI conventions (keep this feel — don't drift)
The sandbox stays **minimal**: full-screen scene, one slim top bar, one collapsible left
drawer. No permanent side panels, no wall of buttons ("中药铺"). If a new control affects the
whole scene it goes in the top bar (field mode, 方向箭头, 线密度, and the 移动/旋转 tool that only
appears while a *rotatable* element is selected — `isRotatableElement`: a closed 2-node loop, a
solenoid, a dipole); anything per-element stays in
the drawer or the context menu.

**`ElementViews.attach()` must sync `transform.mode` every call, not only when the attached
object changes.** A wire flips tools by swapping objects (`translateProxy` ↔ `rotateProxy`), so
an object-identity check happened to work for it; but a dipole/solenoid flips tools on the *same*
mesh, so the check left the mode stuck on `translate` and the gizmo never changed. `TransformControls`
also has exactly one gizmo, and `dragKind` (not `mode`) is what the `objectChange` handler
dispatches on.
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
  the value renders as LaTeX and stays in sync with the panel/title. `ParamSpec.type` covers
  `range` / `log` (log10 slider, `min`/`max` are real values) / `toggle` / `choice` (a row of
  buttons each writing a *set* of params — that is how 「质子」 sets q and m at once). Any control
  that writes more than its own key must be paired with `linkParamControls`, or sibling controls
  (and any `choice` highlight) keep showing stale values.
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
  `kCurrentLoop` (`pos` = centre, `dir` = normal, `p0` = I, `p1` = radius) uses the exact loop
  field via complete elliptic integrals (AGM), and `kDipole` (`p0` = moment) the ideal dipole
  formula. A solenoid is a stack of `kCurrentLoop`s (no C++-side solenoid concept). The dipole
  *is* drawn as an arrow along its moment — note that is `direction × sign(p0)`, so a negative
  moment points the arrow the other way, and the rotate handler must undo that sign.
- **Seed encoding** for `_trace_lines`: flat `double[]`, stride 4 = `[x, y, z, sign]`
  (`sign < 0` traces against the field, used to draw lines arriving at negative charges).
- **Exports** (set in `CMakeLists.txt`): `_malloc`, `_free`, `_set_sources`, `_trace_lines`,
  `_eval_field`, `_particle_advance`; runtime method `getValue`; module global `FieldLineModule`.
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

## 沙盒 ↔ 闯关 互通（深链）
Two pages, two directions, and they must keep working in the offline build (both files are
siblings, so plain relative links survive; no bundler rewriting).

| 方向 | 地址 | 由谁写 |
|---|---|---|
| 沙盒 → 闯关 | `./quiz.html#level=<n>` | `simulate.ts`（顶栏的 `#link-quiz`），回跳到**同一关** |
| 闯关 → 沙盒 | `./index.html#p=<预设 id>&<参数>=<数值>` | `game/levels.ts` 的 `sandboxHref()` |

- The **preset definitions live only in `src/scene/presets.ts`** (sandbox side); the quiz never
  builds a scene, it only names a preset id and passes that level's numbers. The two sides share
  the id string and nothing else. URL params override the preset's defaults.
- A level without a matching preset just omits `Level.sandbox` and the link stays `hidden` —
  the sphere/dielectric/shell levels can't be represented by the sandbox's element kinds at all,
  so don't invent one.
- **Both pages need a `hashchange` listener.** The browser does *not* re-run scripts when only
  the fragment changes, so `quiz.html` → `quiz.html#level=6` (or pasting a deep link into an
  already-open tab) would otherwise be silently ignored. Related: when testing deep links by
  automation, navigate via `about:blank` first, or you will "verify" a page that never reloaded.

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
