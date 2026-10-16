import './styles/app.css';

import { buildMagneticSeeds, buildSeeds } from './physics/seeds';
import { FieldEngine, type TraceOptions } from './physics/wasm';
import { ElementViews } from './render/elements3d';
import { FieldLines } from './render/fieldLines';
import { createScene3D } from './render/scene3d';
import { PALETTE, createElement } from './scene/catalog';
import { readPresetFromHash } from './scene/presets';
import { SceneStore } from './scene/store';
import {
  PARTICLE_RUN_CODE,
  readParticleRun,
  vec3,
  type SceneElement,
  type Vec3,
} from './scene/types';
import { createMenuHost, mountContextMenu } from './ui/contextMenu';
import { mountPanel } from './ui/panel';
import { mountToolbar } from './ui/toolbar';
import { ParticleView } from './render/particleView';

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
const particleView: ParticleView = new ParticleView(scene3d.scene);
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

  // 自由点电荷：视觉归 ParticleView；待放开时把笔头交给 gizmo
  const particle = state.elements.find((e) => e.kind === 'freeCharge') ?? null;
  particleView.sync(particle, particle !== null && readParticleRun(particle.params.run) === 'held');
  elementViews.setParticleTarget(particle?.id ?? null, particle ? particleView.head : null);

  retraceDirty = true;
});

store.subscribe((state) => {
  elementViews.sync(state.elements, state.selectedId, state.dragging, scene3d.size(), state.wireTool);
  fieldLines.setArrowsVisible(state.showArrows);

  // 自由点电荷：视觉归 ParticleView；待放开时把笔头交给 gizmo
  const particle = state.elements.find((e) => e.kind === 'freeCharge') ?? null;
  particleView.sync(particle, particle !== null && heldOf(particle));
  elementViews.setParticleTarget(particle?.id ?? null, particle ? particleView.head : null);

  retraceDirty = true;
});

// ---------- 自由点电荷（试探电荷）的逐帧推进 ----------
// 位置 / 速度 / 轨迹都**不进 store**：它们每帧都变，进 store 会触发场线重算和导线几何重建。
// store 里只有配置（q/m/v₀/时间流速）和运行态。

/** 场景的视觉尺度：用来定「每帧走多少」和「多大算飞出」 */
const SCENE_SCALE = 5;
const PARTICLE_MAX_RADIUS = 12;
/** 贴到点电荷/偶极子多近算撞上（只认点状源，穿螺线管内部不算撞） */
const PARTICLE_STOP_RADIUS = 0.12;
const MAX_SUBSTEPS = 256;

const heldOf = (element: SceneElement): boolean => readParticleRun(element.params.run) === 'held';

interface ParticleSim {
  id: string;
  pos: Vec3;
  vel: Vec3;
  /** 每帧推进的物理时长（秒）；放开时按场景自动定标 */
  physicalPerSecond: number;
  run: string;
  trailSeq: number;
}

let particleSim: ParticleSim | null = null;
let lastFrameAt = 0;

/** 真实帧间隔（秒）；切标签页回来会有一大跳，所以夹一下 */
function frameDelta(): number {
  const now = performance.now();
  const dt = lastFrameAt === 0 ? 1 / 60 : (now - lastFrameAt) / 1000;
  lastFrameAt = now;
  return dt;
}

function initialVelocity(element: SceneElement): Vec3 {
  const speed = element.params.v0 ?? 0;
  const d = element.direction;
  if (Math.hypot(d.x, d.y, d.z) < 1e-9) return vec3(speed, 0, 0);
  return { x: d.x * speed, y: d.y * speed, z: d.z * speed };
}

/**
 * 自动定标：让「特征时间」大约 2 秒走完。
 * 电场主导和磁场主导需要的 dt 能差三个数量级，固定 dt 一定在一种情形下糊掉。
 */
function calibrate(engine: FieldEngine, qOverM: number, pos: Vec3, speed: number): number {
  const { e, b } = engine.evalAt(pos.x, pos.y, pos.z);
  const eMag = Math.hypot(e.x, e.y, e.z);
  const bMag = Math.hypot(b.x, b.y, b.z);
  const qm = Math.abs(qOverM);

  let tChar = Infinity;
  if (qm > 0 && bMag > 0) tChar = Math.min(tChar, (2 * Math.PI) / (qm * bMag)); // 回旋周期
  if (qm > 0 && eMag > 0) tChar = Math.min(tChar, Math.sqrt((2 * SCENE_SCALE) / (qm * eMag)));
  if (speed > 0) tChar = Math.min(tChar, SCENE_SCALE / speed); // 直线穿越
  if (!Number.isFinite(tChar) || tChar <= 0) tChar = 1;
  return tChar / 2;
}

function updateParticle(engine: FieldEngine, dtSeconds: number): void {
  const element = store.snapshot.elements.find((e) => e.kind === 'freeCharge');
  if (!element) {
    particleSim = null;
    return;
  }

  const params = element.params;
  const run = readParticleRun(params.run);
  const mass = params.m ?? 1;
  const qOverM = mass > 0 ? ((params.sign ?? 1) * (params.qMag ?? 0)) / mass : 0;
  const trailSeq = params.trailSeq ?? 0;

  if (particleSim === null || particleSim.id !== element.id) {
    particleSim = {
      id: element.id,
      pos: { ...element.position },
      vel: initialVelocity(element),
      physicalPerSecond: 0,
      run,
      trailSeq,
    };
    particleView.clearTrail();
  }
  const sim = particleSim;

  // 重置 / 清除轨迹：trailSeq 变了就断笔；回到 held 再把笔头挪回起点
  if (sim.trailSeq !== trailSeq) {
    sim.trailSeq = trailSeq;
    if (run === 'held') {
      particleView.clearTrail();
      sim.pos = { ...element.position };
      sim.vel = initialVelocity(element);
    } else {
      particleView.breakTrail();
    }
  }

  if (run === 'held') {
    // 待放开：笔头钉在起点；改 v₀ 大小/方向立刻反映在预览箭头上
    sim.pos = { ...element.position };
    sim.vel = initialVelocity(element);
    sim.run = 'held';
    particleView.setHead(sim.pos);
    return;
  }

  if (run === 'stopped') {
    sim.run = 'stopped';
    particleView.setHead(sim.pos);
    return;
  }

  // 放开：只在 held/stopped → running 的那一刻定标一次
  if (sim.run !== 'running') {
    sim.physicalPerSecond = calibrate(
      engine,
      qOverM,
      sim.pos,
      Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z),
    );
    sim.run = 'running';
  }

  const timeScale = params.timeScale ?? 1;
  // 真实帧间隔（夹到 0.1s：切标签页回来会有一大跳，但夹太狠会让低速机器上的“物理时间/秒”被拖慢）
  const dtFrame = Math.min(dtSeconds, 0.1) * sim.physicalPerSecond * timeScale;

  // 子步长：磁场每步转角 ≤ 0.08 rad，且每步位移 ≤ 2% 场景尺度；两者随当前状态自适应
  const { b } = engine.evalAt(sim.pos.x, sim.pos.y, sim.pos.z);
  const bMag = Math.hypot(b.x, b.y, b.z);
  const vMag = Math.hypot(sim.vel.x, sim.vel.y, sim.vel.z);
  const qm = Math.abs(qOverM);
  const dtByField = qm * bMag > 0 ? 0.08 / (qm * bMag) : Infinity;
  const dtBySpeed = vMag > 0 ? (0.02 * SCENE_SCALE) / vMag : Infinity;
  const dtSub = Math.max(1e-18, Math.min(dtFrame, dtByField, dtBySpeed));
  const substeps = Math.max(1, Math.min(MAX_SUBSTEPS, Math.ceil(dtFrame / dtSub)));

  const step = engine.advanceParticle(
    sim,
    qOverM,
    dtFrame / substeps,
    substeps,
    PARTICLE_MAX_RADIUS,
    PARTICLE_STOP_RADIUS,
  );
  particleView.appendSamples(step.samples, step.count);
  particleView.setHead(sim.pos);

  if (step.stopped) {
    // 停住：轨迹留着；「放开」从这里继续，「重置」回起点
    store.updateElement(element.id, { params: { ...params, run: PARTICLE_RUN_CODE.stopped } });
    sim.run = 'stopped';
  }
}

scene3d.onFrame(() => {
  if (engine) updateParticle(engine, frameDelta());
  particleView.update();

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
