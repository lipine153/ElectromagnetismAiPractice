import './styles/app.css';

import { buildSeeds } from './physics/seeds';
import { FieldEngine, type TraceOptions } from './physics/wasm';
import { ElementViews } from './render/elements3d';
import { FieldLines } from './render/fieldLines';
import { createScene3D } from './render/scene3d';
import { nextId, SceneStore } from './scene/store';
import { vec3, type SceneElement } from './scene/types';
import { mountPanel } from './ui/panel';
import { mountToolbar } from './ui/toolbar';

const TRACE: TraceOptions = { step: 0.05, maxSteps: 4000, maxRadius: 10, stopRadius: 0.06 };
/** 场线重算节流：拖动时约 15fps，不追 60fps */
const TRACE_INTERVAL_MS = 1000 / 15;

const viewport = document.getElementById('viewport');
if (!viewport) throw new Error('缺少 #viewport');

const store = new SceneStore();
const scene3d = createScene3D(viewport);
const elementViews = new ElementViews(scene3d, store);
const fieldLines = new FieldLines(scene3d.scene, scene3d.size());

mountToolbar(store);
mountPanel(store);

scene3d.onResize(() => {
  const { width, height } = scene3d.size();
  fieldLines.setResolution(width, height);
});

let engine: FieldEngine | null = null;
let retraceDirty = true;
let lastTraceAt = 0;

/** 阶段 0 只有电学；磁学场源在后续阶段加入 */
const hasMagneticSource = (list: readonly SceneElement[]): boolean =>
  list.some((e) => e.kind !== 'charge');

function retrace(): void {
  if (!engine) return;
  const state = store.snapshot;
  engine.upload(state.elements);

  const seeds = buildSeeds(state.elements);
  const wantE = state.fieldMode !== 'B';
  const wantB = state.fieldMode !== 'E';

  fieldLines.update('E', wantE && seeds.length > 0 ? engine.trace('E', seeds, TRACE) : null);

  if (wantB && hasMagneticSource(state.elements)) {
    fieldLines.update('B', engine.trace('B', seeds, TRACE));
  } else {
    fieldLines.update('B', null);
  }
}

store.subscribe((state) => {
  elementViews.sync(state.elements, state.selectedId, state.dragging);
  retraceDirty = true;
});

scene3d.onFrame(() => {
  if (!retraceDirty || engine === null) return;
  const now = performance.now();
  if (now - lastTraceAt < TRACE_INTERVAL_MS) return;
  lastTraceAt = now;
  retraceDirty = false;
  retrace();
});

/** 初始给一个电偶极子示例，方便一眼看到效果（可删） */
function seedDemoScene(): void {
  const charge = (x: number, q: number): SceneElement => ({
    id: nextId(),
    kind: 'charge',
    position: vec3(x, 0, 0),
    direction: vec3(0, 0, 1),
    velocity: vec3(),
    params: { q },
  });
  store.addElement(charge(-1.2, 1e-9));
  store.addElement(charge(1.2, -1e-9));
  store.select(null);
}

FieldEngine.load()
  .then((loaded) => {
    engine = loaded;
    seedDemoScene();
    retraceDirty = true;
    document.body.classList.add('sim-ready');
  })
  .catch((err: unknown) => {
    console.error('Wasm 初始化失败:', err);
    const hint = document.getElementById('sim-hint');
    if (hint) hint.textContent = '物理引擎加载失败，请看控制台。';
  });
