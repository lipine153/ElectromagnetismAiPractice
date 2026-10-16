export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

/** 场源种类编码，必须与 cpp/include/source.hpp 的 SourceKind 一致 */
export const SOURCE_KIND = {
  charge: 1,
  straightWire: 2,
  currentLoop: 3,
  solenoid: 4,
  dipole: 5,
  capacitor: 6,
} as const;

export type ElementKind = keyof typeof SOURCE_KIND | 'freeCharge';

/**
 * 自由点电荷（有质量的试探电荷）的运行态。
 * 它**不是场源**：只感受 E/B，不参与 _set_sources，所以移动它不会触发场线重算。
 */
export type ParticleRun = 'held' | 'running' | 'stopped';

/** 存进 params 的编码（params 只能放数字） */
export const PARTICLE_RUN_CODE: Readonly<Record<ParticleRun, number>> = {
  held: 0,
  running: 1,
  stopped: 2,
};

export function readParticleRun(code: number | undefined): ParticleRun {
  if (code === PARTICLE_RUN_CODE.running) return 'running';
  if (code === PARTICLE_RUN_CODE.stopped) return 'stopped';
  return 'held';
}

/** 每个场源上传到 Wasm 时占 12 个 double（见 cpp/include/source.hpp） */
export const SOURCE_STRIDE = 12;

export interface SceneElement {
  id: string;
  kind: ElementKind;
  position: Vec3;
  /** 方向（单位向量）；点电荷用不到，圆环用它存法向 */
  direction: Vec3;
  /** 速度，拖拽时更新；运动源会用到 */
  velocity: Vec3;
  /** 各 kind 的参数，例如电荷的 q、导线的 i / closed */
  params: Record<string, number>;
  /** 折线要素（通电导线）的节点；其它要素为空 */
  nodes?: Vec3[];
}

export type FieldMode = 'E' | 'B' | 'both';

/** 导线选中时 gizmo 干什么用：整体平移 / 改圆环平面方向 */
export type WireTool = 'move' | 'rotate';
