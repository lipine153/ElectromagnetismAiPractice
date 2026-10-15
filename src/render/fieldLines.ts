import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import type { TracedLines } from '../physics/wasm';
import { rampColor } from './colors';

type Field = 'E' | 'B';

/** E / B 两组场线。每组共享一个 LineMaterial（顶点色），resolution 只更新两次。 */
export class FieldLines {
  private readonly groups: Record<Field, THREE.Group>;
  private readonly materials: Record<Field, LineMaterial>;

  constructor(scene: THREE.Scene, size: { width: number; height: number }) {
    const makeMaterial = (): LineMaterial => {
      const material = new LineMaterial({
        linewidth: 2,
        vertexColors: true,
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
      });
      material.resolution.set(size.width, size.height);
      return material;
    };

    this.materials = { E: makeMaterial(), B: makeMaterial() };
    this.groups = { E: new THREE.Group(), B: new THREE.Group() };
    this.groups.E.name = 'field-lines-E';
    this.groups.B.name = 'field-lines-B';
    scene.add(this.groups.E, this.groups.B);
  }

  setResolution(width: number, height: number): void {
    this.materials.E.resolution.set(width, height);
    this.materials.B.resolution.set(width, height);
  }

  update(field: Field, traced: TracedLines | null): void {
    const group = this.groups[field];
    for (const child of group.children) {
      (child as Line2).geometry.dispose();
    }
    group.clear();
    if (!traced) return;

    const { data, lines } = traced;
    for (const line of lines) {
      if (line.count < 2) continue;

      // 该条线的 |F| 范围（对数映射，压缩动态范围）
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < line.count; i += 1) {
        const m = data[line.offset + i * 4 + 3];
        if (m > 0 && Number.isFinite(m)) {
          if (m < min) min = m;
          if (m > max) max = m;
        }
      }
      if (!Number.isFinite(min) || max <= 0) continue;

      const logMin = Math.log10(min * 0.5);
      const logMax = Math.log10(max);
      const span = Math.max(1e-6, logMax - logMin);

      const positions = new Float32Array(line.count * 3);
      const colors = new Float32Array(line.count * 3);
      for (let i = 0; i < line.count; i += 1) {
        const o = line.offset + i * 4;
        positions[i * 3] = data[o];
        positions[i * 3 + 1] = data[o + 1];
        positions[i * 3 + 2] = data[o + 2];

        const safe = Math.max(data[o + 3], min * 0.5);
        const [r, g, b] = rampColor(field, (Math.log10(safe) - logMin) / span);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }

      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      group.add(new Line2(geometry, this.materials[field]));
    }
  }
}
