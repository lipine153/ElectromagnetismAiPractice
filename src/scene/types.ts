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

export type ElementKind = keyof typeof SOURCE_KIND;

/** 每个场源上传到 Wasm 时占 12 个 double（见 cpp/include/source.hpp） */
export const SOURCE_STRIDE = 12;

export interface SceneElement {
  id: string;
  kind: ElementKind;
  position: Vec3;
  /** 方向（单位向量）；点电荷用不到，磁源会用 */
  direction: Vec3;
  /** 速度，拖拽时更新；运动源会用到 */
  velocity: Vec3;
  /** 各 kind 的参数，例如电荷的 q */
  params: Record<string, number>;
}

export type FieldMode = 'E' | 'B' | 'both';
