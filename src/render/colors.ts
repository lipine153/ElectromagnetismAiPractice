import * as THREE from 'three';

interface Ramp {
  h0: number;
  h1: number;
  s: number;
  l0: number;
  l1: number;
}

/** 电场用暖色系、磁场用冷色系。明度从很暗铺到很亮，弱场几乎融进背景、强场刺眼，强弱一眼可辨 */
export const RAMPS: Record<'E' | 'B', Ramp> = {
  E: { h0: 12, h1: 56, s: 0.95, l0: 0.18, l1: 0.9 },
  B: { h0: 232, h1: 190, s: 0.9, l0: 0.16, l1: 0.85 },
};

const tmp = new THREE.Color();

/** t ∈ [0,1]（按对数映射后的场强）→ RGB */
export function rampColor(field: 'E' | 'B', t: number): [number, number, number] {
  const r = RAMPS[field];
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  tmp.setHSL((r.h0 + (r.h1 - r.h0) * c) / 360, r.s, r.l0 + (r.l1 - r.l0) * c);
  return [tmp.r, tmp.g, tmp.b];
}
