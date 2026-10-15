import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { wireCenterline } from '../scene/geometry';
import type { SceneElement, Vec3 } from '../scene/types';

const BODY_WIDTH = 5;
const BODY_COLOR = 0xcbd5e1;
const EXT_WIDTH = 1.6;
const EXT_COLOR = 0x5b6b85;
const HANDLE_RADIUS = 0.11;
const HANDLE_COLOR = 0xffffff;
const CURRENT_ARROW_COLOR = 0x4ade80;
const ARROW_SPACING = 1.1;
const ARROW_RADIUS = 0.045;
const ARROW_HEIGHT = 0.13;
const MAX_ARROWS = 512;
/** 无穷延伸段画多长（只是视觉提示） */
const EXT_DISPLAY = 6;

const UP = new THREE.Vector3(0, 1, 0);

const toVec = (p: Vec3): THREE.Vector3 => new THREE.Vector3(p.x, p.y, p.z);

const unit = (x: number, y: number, z: number): THREE.Vector3 => {
  const v = new THREE.Vector3(x, y, z);
  return v.lengthSq() > 1e-18 ? v.normalize() : new THREE.Vector3(0, 0, 1);
};

/**
 * 通电导线的可视化：导体本体 + 无穷延伸虚线段 + 节点手柄 + 电流方向箭头。
 *
 * 几何每次更新按节点重建（点数很少）。为了让 TransformControls 不对冲，平移/旋转各挂
 * 一个**不可见代理**对象：读代理的增量再写回数据，代理本身不被重置。
 */
export class WireView {
  readonly root = new THREE.Group();
  /** 整体平移代理（位于导线形心） */
  readonly translateProxy = new THREE.Object3D();
  /** 圆环改平面方向代理（位于圆心，rotate 模式） */
  readonly rotateProxy = new THREE.Object3D();

  readonly handles: THREE.Mesh[] = [];
  /** 导体本体的线（供拾取使用） */
  readonly body: Line2;

  private readonly extA: Line2;
  private readonly extB: Line2;
  private readonly arrows: THREE.InstancedMesh;
  private readonly handleGeometry = new THREE.SphereGeometry(HANDLE_RADIUS, 16, 12);
  private readonly handleMaterial = new THREE.MeshBasicMaterial({ color: HANDLE_COLOR });

  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);

  constructor(size: { width: number; height: number }) {
    const makeLine = (width: number, color: number, opacity: number): Line2 => {
      const material = new LineMaterial({ linewidth: width, color, transparent: true, opacity });
      material.resolution.set(size.width, size.height);
      const line = new Line2(new LineGeometry(), material);
      line.frustumCulled = false;
      return line;
    };

    this.body = makeLine(BODY_WIDTH, BODY_COLOR, 1);
    this.extA = makeLine(EXT_WIDTH, EXT_COLOR, 0.45);
    this.extB = makeLine(EXT_WIDTH, EXT_COLOR, 0.45);
    this.extA.visible = false;
    this.extB.visible = false;

    this.arrows = new THREE.InstancedMesh(
      new THREE.ConeGeometry(ARROW_RADIUS, ARROW_HEIGHT, 6),
      new THREE.MeshBasicMaterial({ color: CURRENT_ARROW_COLOR }),
      MAX_ARROWS,
    );
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;

    this.translateProxy.visible = false;
    this.rotateProxy.visible = false;

    this.root.add(this.body, this.extA, this.extB, this.arrows, this.translateProxy, this.rotateProxy);
  }

  setResolution(width: number, height: number): void {
    for (const line of [this.body, this.extA, this.extB]) {
      (line.material as LineMaterial).resolution.set(width, height);
    }
  }

  /** 用最新的要素数据重建几何 */
  update(element: SceneElement): void {
    const { points, closed } = wireCenterline(element);
    const world = points.map(toVec);

    if (world.length >= 2) {
      const list = closed ? [...world, world[0]] : world;
      this.body.visible = true;
      this.body.geometry.dispose();
      const geometry = new LineGeometry();
      geometry.setPositions(list.flatMap((p) => [p.x, p.y, p.z]));
      this.body.geometry = geometry;
    } else {
      this.body.visible = false;
    }

    const isOpen = !closed && world.length >= 2;
    this.extA.visible = isOpen;
    this.extB.visible = isOpen;
    if (isOpen) {
      const head = world[0];
      const headDir = unit(head.x - world[1].x, head.y - world[1].y, head.z - world[1].z);
      const tail = world[world.length - 1];
      const prev = world[world.length - 2];
      const tailDir = unit(tail.x - prev.x, tail.y - prev.y, tail.z - prev.z);
      this.setLine(this.extA, head, headDir);
      this.setLine(this.extB, tail, tailDir);
    }

    this.body.userData.id = element.id;
    // 手柄必须对应**要素自己的节点**，而不是中心线的离散点：
    // 闭合圆环的中心线有 33 个点，但真正的节点只有 2 个（直径两端）。
    this.updateHandles((element.nodes ?? []).map(toVec), element.id);
    this.updateArrows(world, closed);
    this.updateProxies(element, world, closed);
  }

  private setLine(line: Line2, from: THREE.Vector3, dir: THREE.Vector3): void {
    const to = from.clone().addScaledVector(dir, EXT_DISPLAY);
    line.geometry.dispose();
    const geometry = new LineGeometry();
    geometry.setPositions([from.x, from.y, from.z, to.x, to.y, to.z]);
    line.geometry = geometry;
  }

  private updateHandles(world: THREE.Vector3[], id: string): void {
    while (this.handles.length < world.length) {
      const mesh = new THREE.Mesh(this.handleGeometry, this.handleMaterial);
      this.handles.push(mesh);
      this.root.add(mesh);
    }
    this.handles.forEach((handle, i) => {
      const point = world[i];
      // 手柄常显（很小），这样单击就能选中某个节点；不可见的只能是被删掉的旧手柄
      handle.visible = !!point;
      handle.userData.id = id;
      handle.userData.node = i;
      if (point) handle.position.copy(point);
    });
  }

  private updateArrows(world: THREE.Vector3[], closed: boolean): void {
    const list = closed ? [...world, world[0]] : world;
    let count = 0;
    let arc = 0;
    let nextAt = ARROW_SPACING * 0.6;

    for (let i = 1; i < list.length && count < MAX_ARROWS; i += 1) {
      const a = list[i - 1];
      const b = list[i];
      const segment = b.distanceTo(a);
      if (!(segment > 1e-9)) continue;

      while (nextAt <= arc + segment && count < MAX_ARROWS) {
        const t = (nextAt - arc) / segment;
        this.position.copy(a).lerp(b, t);
        this.direction.copy(b).sub(a).divideScalar(segment);
        this.quaternion.setFromUnitVectors(UP, this.direction);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.arrows.setMatrixAt(count, this.matrix);
        count += 1;
        nextAt += ARROW_SPACING;
      }
      arc += segment;
    }

    this.arrows.count = count;
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  private updateProxies(element: SceneElement, world: THREE.Vector3[], closed: boolean): void {
    const centroid = new THREE.Vector3();
    for (const p of world) centroid.add(p);
    if (world.length > 0) centroid.divideScalar(world.length);
    this.translateProxy.position.copy(centroid);

    // 旋转代理只在「两节点闭合的圆」上有意义：圆心 + 法向姿态
    this.rotateProxy.visible = closed && world.length >= 2;
    if (this.rotateProxy.visible) {
      this.rotateProxy.position.copy(world[0]).add(world[1]).multiplyScalar(0.5);
      this.normal.set(element.direction.x, element.direction.y, element.direction.z);
      if (this.normal.lengthSq() < 1e-9) this.normal.copy(UP);
      this.normal.normalize();
      this.quaternion.setFromUnitVectors(UP, this.normal);
      this.rotateProxy.quaternion.copy(this.quaternion);
    }
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.extA.geometry.dispose();
    this.extB.geometry.dispose();
    this.arrows.geometry.dispose();
    this.handleGeometry.dispose();
    this.handleMaterial.dispose();
  }
}
