import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import type { TracedLines } from '../physics/wasm';
import { rampColor } from './colors';

type Field = 'E' | 'B';

/** 色阶跨度的上下限（数量级）。上限压到 4：再宽的话大量点会挤在中间调，强弱就看不出来了 */
const MIN_SPAN_DECADES = 2;
const MAX_SPAN_DECADES = 4;

/**
 * 除了颜色，再按强度分档改变线宽和不透明度：
 * 强场又粗又实、弱场又细又淡，这样强弱不只靠色相，直观得多。
 */
const BUCKETS = [
  { width: 1.4, opacity: 0.5 },
  { width: 2.1, opacity: 0.78 },
  { width: 3.0, opacity: 1.0 },
];
const BUCKET_THRESHOLDS = [0.34, 0.67];

function bucketOf(t: number): number {
  if (t >= BUCKET_THRESHOLDS[1]) return 2;
  if (t >= BUCKET_THRESHOLDS[0]) return 1;
  return 0;
}

/** E / B 两组场线。每组按强度分档共享材质，resolution 只更新几次。 */
export class FieldLines {
  private readonly groups: Record<Field, THREE.Group>;
  private readonly materials: Record<Field, LineMaterial[]>;

  constructor(scene: THREE.Scene, size: { width: number; height: number }) {
    const makeMaterials = (): LineMaterial[] =>
      BUCKETS.map(({ width, opacity }) => {
        const material = new LineMaterial({
          linewidth: width,
          vertexColors: true,
          color: 0xffffff,
          transparent: true,
          opacity,
        });
        material.resolution.set(size.width, size.height);
        return material;
      });

    this.materials = { E: makeMaterials(), B: makeMaterials() };
    this.groups = { E: new THREE.Group(), B: new THREE.Group() };
    this.groups.E.name = 'field-lines-E';
    this.groups.B.name = 'field-lines-B';
    scene.add(this.groups.E, this.groups.B);
  }

  setResolution(width: number, height: number): void {
    for (const field of ['E', 'B'] as const) {
      for (const material of this.materials[field]) material.resolution.set(width, height);
    }
  }

  update(field: Field, traced: TracedLines | null): void {
    const group = this.groups[field];
    for (const child of group.children) {
      (child as Line2).geometry.dispose();
    }
    group.clear();
    if (!traced) return;

    const { data, lines } = traced;

    // 全局色阶：整场共用同一套映射，因此「哪里强、哪里弱」可以直接靠颜色比较。
    // 跨度按当前场景的实际范围自适应（限制在 2~4 个数量级），避免只用到半截色阶。
    let maxF = 0;
    let minF = Infinity;
    for (let i = 3; i < data.length; i += 4) {
      const m = data[i];
      if (Number.isFinite(m) && m > 0) {
        if (m > maxF) maxF = m;
        if (m < minF) minF = m;
      }
    }
    if (!(maxF > 0) || !Number.isFinite(minF)) return;

    const logMax = Math.log10(maxF);
    const span = Math.min(MAX_SPAN_DECADES, Math.max(MIN_SPAN_DECADES, logMax - Math.log10(minF)));
    const logFloor = logMax - span;
    const strengthAt = (o: number): number => {
      const m = data[o + 3];
      return m > 0 ? (Math.log10(m) - logFloor) / span : 0;
    };

    /** 把一条线的 [from, to] 区间画成一段（端点重复，接缝不留空隙） */
    const emit = (line: { offset: number; count: number }, from: number, to: number, bucket: number): void => {
      const n = to - from + 1;
      if (n < 2) return;

      const positions = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      for (let k = 0; k < n; k += 1) {
        const o = line.offset + (from + k) * 4;
        positions[k * 3] = data[o];
        positions[k * 3 + 1] = data[o + 1];
        positions[k * 3 + 2] = data[o + 2];
        const [r, g, b] = rampColor(field, strengthAt(o));
        colors[k * 3] = r;
        colors[k * 3 + 1] = g;
        colors[k * 3 + 2] = b;
      }

      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      group.add(new Line2(geometry, this.materials[field][bucket]));
    };

    for (const line of lines) {
      if (line.count < 2) continue;

      let start = 0;
      let bucket = bucketOf(strengthAt(line.offset));
      for (let i = 1; i < line.count; i += 1) {
        const next = bucketOf(strengthAt(line.offset + i * 4));
        if (next !== bucket) {
          emit(line, start, i, bucket); // 含 i，与下一段共用端点
          start = i;
          bucket = next;
        }
      }
      emit(line, start, line.count - 1, bucket);
    }
  }
}
