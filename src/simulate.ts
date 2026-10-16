import './styles/app.css';

import { buildMagneticSeeds, buildSeeds } from './physics/seeds';
import { FieldEngine, type TraceOptions } from './physics/wasm';
import { ElementViews } from './render/elements3d';
import { FieldLines } from './render/fieldLines';
import { createScene3D } from './render/scene3d';
import { PALETTE, createElement } from './scene/catalog';
import { readPresetFromHash } from './scene/presets';
import { SceneStore } from './scene/store';
import { vec3, type SceneElement } from './scene/types';
import { createMenuHost, mountContextMenu } from './ui/contextMenu';
import { mountPanel } from './ui/panel';
import { mountToolbar } from './ui/toolbar';

const TRACE: TraceOptions = { step: 0.05, maxSteps: 4000, maxRadius: 10, stopRadius: 0.06 };

/**
 * 磁场线单独的配置：**弧长上限短得多**。
 * 多根导体叠加后的磁场一般不闭合（场线会绕着多根线无限缠绕），
 * 若不设限，每条线都会跑满步数上限，几十条线堆在一起就是一团实心，
 * 完全看不出结构。这里截断到约 15 个单位的弧长。
 */
const TRACE_B: TraceOptions = { ...TRACE, maxSteps: 300 };
/** 场线重算节流：拖动时约 15fps，不追 60fps */
const TRACE_INTERVAL_MS = 1000 / 15;

const viewport = document.getElementById('viewport');
if (!viewport) throw new Error('缺少 #viewport');

const store = new SceneStore();
const scene3d = createScene3D(viewport);
const elementViews = new ElementViews(scene3d, store);
const fieldLines = new FieldLines(scene3d.scene, scene3d.size());

// mountPanel 之外再挂右键菜单：空白处添加、要素上删除/改参数/增删节点
const menuHost = createMenuHost(store);
mountToolbar(store);
mountPanel(store, menuHost);
if (menuHost) {
  mountContextMenu(store, {
    canvas: scene3d.canvas,
    pickAt: (x, y) => elementViews.pickAt(x, y),
    pickGround: (x, y) => elementViews.pickGround(x, y),
    selectNode: (index) => elementViews.setSelectedNode(index),
  }, menuHost);
}

scene3d.onResize(() => {
  const { width, height } = scene3d.size();
  fieldLines.setResolution(width, height);
});

let engine: FieldEngine | null = null;
let retraceDirty = true;
let lastTraceAt = 0;

/** 阶段 2：磁学来自通电导线 */
const hasMagneticSource = (list: readonly SceneElement[]): boolean =>
  list.some(
    (e) =>
      (e.kind === 'straightWire' || e.kind === 'solenoid') && (e.params.i ?? 0) !== 0,
  ) || list.some((e) => e.kind === 'dipole' && (e.params.m ?? 0) !== 0);

function retrace(): void {
  if (!engine) return;
  const state = store.snapshot;
  engine.upload(state.elements);

  const wantE = state.fieldMode !== 'B';
  const wantB = state.fieldMode !== 'E';

  const eSeeds = buildSeeds(state.elements, state.lineDensity);
  fieldLines.update('E', wantE && eSeeds.length > 0 ? engine.trace('E', eSeeds, TRACE) : null);

  const bSeeds = buildMagneticSeeds(state.elements, state.lineDensity);
  fieldLines.update('B', wantB && hasMagneticSource(state.elements) ? engine.trace('B', bSeeds, TRACE_B) : null);
}

store.subscribe((state) => {
  elementViews.sync(state.elements, state.selectedId, state.dragging, scene3d.size(), state.wireTool);
  fieldLines.setArrowsVisible(state.showArrows);
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

/** 初始示例：一个电偶极子 + 一个圆形电流环（可删） */
function seedDemoScene(): void {
  const positive = PALETTE.find((item) => item.id === 'charge+');
  const negative = PALETTE.find((item) => item.id === 'charge-');
  const wire = PALETTE.find((item) => item.id === 'wire');

  if (positive) store.addElement(createElement(positive, vec3(-1.2, 0, 0)));
  if (negative) store.addElement(createElement(negative, vec3(1.2, 0, 0)));
  if (wire) {
    // 只有这一个示例是圆环（闭合）；之后从要素库新加的导线默认是开放直导线
    const loop = createElement(wire, vec3(0, 0, 2.5));
    loop.params.closed = 1;
    store.addElement(loop);
  }

  store.select(null);
}

/**
 * 开局场景：带 `#p=...` 进来就用闯关那一关的预设，否则用默认示例。
 * 顺带把「闯关」按钮指回**同一关**，这样两边来回跳不会每次都掉回第 1 关。
 */
function loadScene(hash: string): string | null {
  store.clear();
  const linked = readPresetFromHash(hash);

  if (!linked) {
    seedDemoScene();
    return null;
  }

  for (const element of linked.preset.build(linked.params)) store.addElement(element);
  store.setFieldMode(linked.preset.fieldMode);
  store.select(null);

  const back = document.getElementById('link-quiz');
  if (back instanceof HTMLAnchorElement) back.href = `./quiz.html#level=${linked.preset.level}`;
  return linked.preset.label;
}

/** 只在深链进来时补一句说明，别把默认的操作提示冲掉 */
function showLinkHint(label: string | null): void {
  const hint = document.getElementById('sim-hint');
  if (!hint || !label) return;
  hint.textContent = `已按闯关载入「${label}」 · ${hint.textContent}`;
}

FieldEngine.load()
  .then((loaded) => {
    engine = loaded;
    showLinkHint(loadScene(window.location.hash));
    retraceDirty = true;
    document.body.classList.add('sim-ready');
  })
  .catch((err: unknown) => {
    console.error('Wasm 初始化失败:', err);
    const hint = document.getElementById('sim-hint');
    if (hint) hint.textContent = '物理引擎加载失败，请看控制台。';
  });

// 同文档内改 hash 不会触发重新加载（浏览器只换 fragment），所以自己听一下：
// 这样「把深链粘到已打开的沙盒页」也能生效
window.addEventListener('hashchange', () => {
  showLinkHint(loadScene(window.location.hash));
  retraceDirty = true;
});
