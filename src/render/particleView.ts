import * as THREE from 'three';

import { elementColor } from '../scene/catalog';
import type { SceneElement, Vec3 } from '../scene/types';

/**
 * 拖尾最多保留多少个点。笔迹用 InstancedMesh 逐段画，实例数随点数线性增长，
 * 所以按住 2000 封顶。
 */
const MAX_TRAIL_POINTS = 2000;

/**
 * 「荧光笔」= 沿轨迹叠三层圆柱：外晕粗而淡、笔身中等、笔芯细而亮，
 * 叠加混合 + 不写深度。用 InstancedMesh 而不是 Line2 的粗线：
 * 每段一个实例、可逐实例调色（用来做尾部渐隐），而且走的是已经在本项目里跑通的实例化路径。
 */
const LAYERS = [
  { token: '--color-trail-glow', fallback: 0x15803d, radius: 0.055, opacity: 0.1 },
  { token: '--color-trail', fallback: 0x4ade80, radius: 0.026, opacity: 0.34 },
  { token: '--color-trail-core', fallback: 0xd9fbe5, radius: 0.009, opacity: 0.95 },
];

/** 预览箭头：长度按 log10 映射，1e2~1e8 m/s 都看得见 */
const PREVIEW_MIN = 0.55;
const PREVIEW_MAX = 3.2;
const PREVIEW_V_MIN = 1e2;
const PREVIEW_V_MAX = 1e8;

/** 笔头的局部 +Y 视为 v₀ 方向（旋转工具读的也是对象四元数的 +Y） */
const UP_AXIS = new THREE.Vector3(0, 1, 0);
/** 圆柱几何按 +Y 拉长，单位长度 1、半径 1，实例里再缩放成实际粗细与长度 */
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);

interface TrailLayer {
  mesh: THREE.InstancedMesh;
  radius: number;
  base: THREE.Color;
}

function tokenColor(name: string, fallback: number): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(raw || fallback);
}

function toV(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z);
}

/** 自由点电荷的笔头 + 荧光笔拖尾（+ 待放开时的速度预览箭头） */
export class ParticleView {
  /** 归 TransformControls 挂的「笔头」对象（待放开时用来拖动定位 / 旋转定方向） */
  readonly head = new THREE.Object3D();

  private readonly headMesh: THREE.Mesh;
  private readonly headMaterial: THREE.MeshStandardMaterial;
  private readonly group = new THREE.Group();
  private readonly preview: THREE.ArrowHelper;
  private readonly layers: TrailLayer[] = [];

  /** 扁平 xyz；NaN 表示这里断开（重置后不画假直线） */
  private points: number[] = [];
  private trailDirty = true;

  private readonly direction = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.group.name = 'free-charge-trail';

    this.headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 24, 16),
      new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 }),
    );
    this.headMaterial = this.headMesh.material as THREE.MeshStandardMaterial;
    this.head.add(this.headMesh);

    for (const layer of LAYERS) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: layer.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.InstancedMesh(UNIT_CYLINDER, material, MAX_TRAIL_POINTS);
      mesh.count = 0;
      mesh.frustumCulled = false; // 实例包围球不随更新重算
      mesh.renderOrder = 20; // 荧光笔是「画在上面」的
      this.layers.push({ mesh, radius: layer.radius, base: tokenColor(layer.token, layer.fallback) });
      this.group.add(mesh);
    }

    this.preview = new THREE.ArrowHelper(
      UP_AXIS,
      new THREE.Vector3(),
      1,
      tokenColor('--color-trail', 0x4ade80).getHex(),
      0.26,
      0.13,
    );
    this.preview.visible = false;
    this.head.add(this.preview);

    scene.add(this.group, this.head);
  }

  /** 配置变化时同步：笔头朝向跟 v₀ 方向走，预览箭头长度跟 v₀ 大小走 */
  sync(element: SceneElement | null, held: boolean): void {
    this.head.visible = element !== null;
    if (!element) {
      this.preview.visible = false;
      // 粒子被删掉时笔迹也要跟着消失，否则会留下一条没人管的轨迹
      if (this.points.length > 0) this.clearTrail();
      return;
    }

    const color = elementColor(element.kind, element.params);
    if (this.headMaterial.color.getHex() !== color) {
      this.headMaterial.color.setHex(color);
      this.headMaterial.emissive.setHex(color);
    }
    this.headMaterial.emissiveIntensity = 0.5;

    // 笔头的 +Y 就是 v₀ 方向：旋转工具读的正是对象四元数的 +Y 轴，
    // 而预览箭头是笔头的子对象（局部 +Y），所以两者自动一致，不用各转一次。
    const axis = toV(element.direction);
    if (axis.lengthSq() < 1e-12) axis.set(1, 0, 0);
    this.head.quaternion.setFromUnitVectors(UP_AXIS, axis.normalize());

    const speed = element.params.v0 ?? 0;
    const t = Math.min(
      1,
      Math.max(
        0,
        (Math.log10(Math.max(speed, 1)) - Math.log10(PREVIEW_V_MIN)) /
          (Math.log10(PREVIEW_V_MAX) - Math.log10(PREVIEW_V_MIN)),
      ),
    );
    this.preview.setLength(PREVIEW_MIN + t * (PREVIEW_MAX - PREVIEW_MIN), 0.26, 0.13);
    this.preview.visible = held;
  }

  /** 笔头位置（待放开 = 起点，运行中 = 当前积分位置） */
  setHead(pos: Vec3): void {
    this.head.position.set(pos.x, pos.y, pos.z);
  }

  /** 追加本帧的子步采样点 */
  appendSamples(samples: Float32Array, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const x = samples[i * 3];
      const y = samples[i * 3 + 1];
      const z = samples[i * 3 + 2];
      const n = this.points.length;
      if (n >= 3) {
        // 和上一个点几乎重合就跳过（零长线段画出来是个实心点）
        const dx = x - this.points[n - 3];
        const dy = y - this.points[n - 2];
        const dz = z - this.points[n - 1];
        if (dx * dx + dy * dy + dz * dz < 1e-8) continue;
      }
      this.points.push(x, y, z);
    }
    const maxFloats = MAX_TRAIL_POINTS * 3;
    if (this.points.length > maxFloats) {
      this.points.splice(0, this.points.length - maxFloats);
    }
    this.trailDirty = true;
  }

  /** 开始一段新笔迹（重置时用）：先断开，避免和旧轨迹之间连出一条假直线 */
  breakTrail(): void {
    this.points.push(NaN, NaN, NaN);
    this.trailDirty = true;
  }

  clearTrail(): void {
    this.points = [];
    this.trailDirty = true;
  }

  /** 每帧调用：有新点才重建实例矩阵 */
  update(): void {
    if (!this.trailDirty) return;
    this.trailDirty = false;

    // 逐段生成实例：位置取中点、缩放成（粗细, 段长, 粗细）、朝向沿 +Y 对齐段方向
    const segments: Array<{ mid: THREE.Vector3; dir: THREE.Vector3; len: number; t: number }> = [];
    const total = this.points.length / 3;
    for (let i = 1; i < this.points.length / 3; i += 1) {
      const a = (i - 1) * 3;
      const b = i * 3;
      if (Number.isNaN(this.points[a]) || Number.isNaN(this.points[b])) continue;
      const ax = this.points[a];
      const ay = this.points[a + 1];
      const az = this.points[a + 2];
      const dx = this.points[b] - ax;
      const dy = this.points[b + 1] - ay;
      const dz = this.points[b + 2] - az;
      const len = Math.hypot(dx, dy, dz);
      if (!(len > 1e-6)) continue;
      segments.push({
        mid: new THREE.Vector3(ax + dx * 0.5, ay + dy * 0.5, az + dz * 0.5),
        dir: new THREE.Vector3(dx / len, dy / len, dz / len),
        len,
        t: i / Math.max(1, total - 1),
      });
    }

    for (const layer of this.layers) {
      const mesh = layer.mesh;
      const n = Math.min(segments.length, MAX_TRAIL_POINTS);
      for (let i = 0; i < n; i += 1) {
        const seg = segments[i];
        this.direction.copy(seg.dir);
        this.quaternion.setFromUnitVectors(UP_AXIS, this.direction);
        this.scale.set(layer.radius, seg.len, layer.radius);
        this.matrix.compose(seg.mid, this.quaternion, this.scale);
        mesh.setMatrixAt(i, this.matrix);
        // 尾部渐隐：叠加混合下颜色越暗越像「淡下去」
        this.color.copy(layer.base).multiplyScalar(0.25 + 0.75 * seg.t);
        mesh.setColorAt(i, this.color);
      }
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const layer of this.layers) {
      (layer.mesh.material as THREE.Material).dispose();
    }
    this.headMesh.geometry.dispose();
    this.headMaterial.dispose();
  }
}
