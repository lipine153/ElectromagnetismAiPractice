import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { elementColor } from '../scene/catalog';
import {
  isRotatableElement,
  isTwoNodeCircle,
  projectOntoAxis,
  rotateLoop,
  snapDirectionToAxis,
} from '../scene/geometry';
import type { SceneStore } from '../scene/store';
import { readParticleRun, type SceneElement, type Vec3, type WireTool } from '../scene/types';
import type { Scene3D } from './scene3d';
import { WireView } from './wireView';

const SPHERE_RADIUS = 0.12;
const DIPOLE_LENGTH = 1.3;
const VELOCITY_SMOOTHING = 0.35;
const CLICK_SLOP_PX = 4;
const SOLENOID_TUBE_RADIUS = 0.035;
const UP_AXIS = new THREE.Vector3(0, 1, 0);

/** 磁偶极子外形：一根指示磁矩方向的箭头（局部 +Y，再由四元数对齐到磁矩方向） */
function buildDipoleGeometry(): THREE.BufferGeometry {
  const headLength = 0.38;
  const shaftLength = DIPOLE_LENGTH - headLength;

  const shaft = new THREE.CylinderGeometry(0.055, 0.055, shaftLength, 12);
  shaft.translate(0, -headLength / 2, 0);
  const head = new THREE.ConeGeometry(0.13, headLength, 16);
  head.translate(0, (DIPOLE_LENGTH - headLength) / 2, 0);

  return mergeGeometries([shaft, head]);
}

/** 磁矩方向 = direction × sign(m)：m 取负时箭头要指到反方向，否则和实际场不一致 */
function dipoleMomentAxis(el: SceneElement, target: THREE.Vector3): THREE.Vector3 {
  const sign = (el.params.m ?? 0) < 0 ? -1 : 1;
  target.set(el.direction.x, el.direction.y, el.direction.z).multiplyScalar(sign);
  return target.lengthSq() > 1e-18 ? target.normalize() : target;
}

/** 螺线管外形：一条沿局部 +Y 的螺旋线（再用网格四元数对齐到 direction） */
function buildSolenoidGeometry(element: SceneElement): THREE.BufferGeometry {
  const radius = element.params.radius ?? 0.5;
  const length = element.params.length ?? 2;
  const turns = Math.max(2, Math.min(40, Math.round((element.params.n ?? 500) * length)));
  const stepsPerTurn = 10;
  const total = turns * stepsPerTurn;

  const points: THREE.Vector3[] = [];
  for (let k = 0; k <= total; k += 1) {
    const t = k / total;
    const angle = t * turns * Math.PI * 2;
    points.push(
      new THREE.Vector3(radius * Math.cos(angle), (t - 0.5) * length, radius * Math.sin(angle)),
    );
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), total, SOLENOID_TUBE_RADIUS, 5, false);
}

/** 拾取结果：命中的要素、命中的节点下标（导线才有）、命中点 */
export interface ElementPick {
  id: string;
  node: number | null;
  point: Vec3;
}

type DragKind = 'none' | 'node' | 'translate' | 'rotate' | 'simple';

/** 场景里每个要素的 3D 表示 + 选中/拖拽（TransformControls） */
export class ElementViews {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly canvas: HTMLCanvasElement;
  private readonly transform: TransformControls;
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly groundPoint = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane();
  /** 直接拖动导线本体时用的状态（圆环也靠它平移） */
  private bodyDrag: {
    id: string;
    base: Vec3[];
    offset: THREE.Vector3;
    last: THREE.Vector3;
    active: boolean;
  } | null = null;

  /** 简单要素（点电荷等）：直接用网格 */
  private readonly simpleViews = new Map<string, THREE.Mesh>();
  /** 自由点电荷的笔头由 ParticleView 独占，这里只借它当 TransformControls 的目标 */
  private particleTargets: { id: string; object: THREE.Object3D } | null = null;
  /** 螺线管等会随参数变形的要素：记录已构建的尺寸签名 */
  private readonly meshShape = new Map<string, string>();
  /** 折线要素：导线 */
  private readonly wireViews = new Map<string, WireView>();

  private selectedNode: number | null = null;
  private dragKind: DragKind = 'none';
  private draggingId: string | null = null;
  private dragBase: Vec3[] = [];
  /** 「绕圆心旋转」用：拖拽开始时的姿态、节点与法向快照（圆心由节点快照推出） */
  private readonly rotateStartQuat = new THREE.Quaternion();
  private rotateBaseNodes: Vec3[] = [];
  private rotateBaseDir: Vec3 = { x: 0, y: 1, z: 0 };
  private readonly dragOffset = new THREE.Vector3();
  private readonly lastProxy = new THREE.Vector3();
  private readonly lastPos = new THREE.Vector3();
  private lastTime = 0;
  private downX = 0;
  private downY = 0;

  constructor(scene3d: Scene3D, store: SceneStore) {
    this.scene = scene3d.scene;
    this.camera = scene3d.camera;
    this.canvas = scene3d.canvas;

    const transform = new TransformControls(scene3d.camera, scene3d.canvas);
    transform.setSize(0.85);
    transform.mode = 'translate';
    this.transform = transform;
    scene3d.scene.add(transform.getHelper());

    transform.addEventListener('dragging-changed', (event: unknown) => {
      const dragging = Boolean((event as { value?: unknown }).value);
      scene3d.orbit.enabled = !dragging;
      store.setDragging(dragging);

      if (dragging) {
        const element = this.draggingId ? this.find(store, this.draggingId) : undefined;
        this.dragBase = (element?.nodes ?? []).map((n) => ({ ...n }));
        this.dragOffset.set(0, 0, 0);
        this.lastProxy.copy(transform.object?.position ?? new THREE.Vector3());
        this.lastPos.copy(transform.object?.position ?? new THREE.Vector3());
        this.lastTime = performance.now();

        // 旋转：记下起始姿态与节点快照，之后一律按「相对起点的旋转量」整体算，避免逐帧累积漂移
        if (this.dragKind === 'rotate' && transform.object) {
          this.rotateStartQuat.copy(transform.object.quaternion);
          this.rotateBaseNodes = (element?.nodes ?? []).map((n) => ({ ...n }));
          this.rotateBaseDir = { ...(element?.direction ?? { x: 0, y: 1, z: 0 }) };
        }
      } else {
        const id = this.draggingId;
        // 松手：把代理挪到新的形心，并清零速度（避免残留的 v×B 项）
        if (id) {
          const element = this.find(store, id);
          if (element?.kind === 'straightWire') {
            const nodes = element.nodes ?? [];
            const centroid = nodes.reduce(
              (acc, n) => ({ x: acc.x + n.x / nodes.length, y: acc.y + n.y / nodes.length, z: acc.z + n.z / nodes.length }),
              { x: 0, y: 0, z: 0 },
            );
            this.wireViews.get(id)?.translateProxy.position.set(centroid.x, centroid.y, centroid.z);
          }
          store.updateElement(id, { velocity: { x: 0, y: 0, z: 0 } });
        }
        this.dragKind = 'none';
        this.draggingId = null;
      }
    });

    transform.addEventListener('objectChange', () => {
      const id = this.draggingId;
      const element = id ? this.find(store, id) : undefined;
      const object = transform.object;
      if (!element || !object) return;

      if (this.dragKind === 'node') {
        const index = object.userData.node as number;
        const nodes = [...(element.nodes ?? [])];
        const raw = { x: object.position.x, y: object.position.y, z: object.position.z };

        // 与相邻节点的连线接近某个坐标轴时吸附，使这一段严格轴对齐
        const neighbor = nodes[index > 0 ? index - 1 : index + 1];
        let next = raw;
        if (neighbor) {
          const axis = snapDirectionToAxis({
            x: raw.x - neighbor.x,
            y: raw.y - neighbor.y,
            z: raw.z - neighbor.z,
          });
          if (axis) next = projectOntoAxis(raw, neighbor, axis);
        }

        nodes[index] = next;
        store.updateElement(id as string, { nodes });
        return;
      }

      if (this.dragKind === 'translate') {
        const delta = object.position.clone().sub(this.lastProxy);
        this.dragOffset.add(delta);
        this.lastProxy.copy(object.position);
        const nodes = this.dragBase.map((n) => ({
          x: n.x + this.dragOffset.x,
          y: n.y + this.dragOffset.y,
          z: n.z + this.dragOffset.z,
        }));
        store.updateElement(id as string, {
          nodes,
          position: { x: nodes[0].x, y: nodes[0].y, z: nodes[0].z },
        });
        return;
      }

      if (this.dragKind === 'rotate') {
        // TransformControls 在世界空间是**左乘**：q = Δ · q₀，所以 Δ = q · q₀⁻¹
        const delta = object.quaternion
          .clone()
          .multiply(this.rotateStartQuat.clone().invert())
          .normalize();

        if (element.kind === 'straightWire' && isTwoNodeCircle(element)) {
          // 圆环：绕**圆心**整体刚性旋转（几何在 geometry.rotateLoop）
          const rotated = rotateLoop(this.rotateBaseNodes, this.rotateBaseDir, [
            delta.w,
            delta.x,
            delta.y,
            delta.z,
          ]);
          if (rotated) {
            store.updateElement(id as string, {
              nodes: rotated.nodes,
              direction: rotated.direction,
              position: rotated.nodes[0],
            });
            return;
          }
        }

        // 偶极子 / 螺线管：只改朝向，位置不动
        const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion);
        // 偶极子的网格朝向 = direction × sign(m)，换回 direction 要再乘一次 sign
        if (element.kind === 'dipole' && (element.params.m ?? 0) < 0) normal.negate();
        const raw = { x: normal.x, y: normal.y, z: normal.z };
        // 接近某个坐标轴时吸附
        store.updateElement(id as string, { direction: snapDirectionToAxis(raw) ?? raw });
        return;
      }

      // 简单要素：直接跟随
      const now = performance.now();
      const dt = Math.max(1e-3, (now - this.lastTime) / 1000);
      const a = VELOCITY_SMOOTHING;
      const velocity = element.velocity;
      store.updateElement(id as string, {
        position: { x: object.position.x, y: object.position.y, z: object.position.z },
        velocity: {
          x: velocity.x + a * ((object.position.x - this.lastPos.x) / dt - velocity.x),
          y: velocity.y + a * ((object.position.y - this.lastPos.y) / dt - velocity.y),
          z: velocity.z + a * ((object.position.z - this.lastPos.z) / dt - velocity.z),
        },
      });
      this.lastPos.copy(object.position);
      this.lastTime = now;
    });

    // 点选：用「按下 / 抬起」位移区分点选和转视角
    scene3d.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
      this.downX = event.clientX;
      this.downY = event.clientY;

      // 直接拖动导线本体 = 整体平移（圆环也这样移动）；节点由 gizmo 单独拖
      if (event.button !== 0 || transform.dragging || transform.axis !== null) return;
      const hit = this.pickAt(event.clientX, event.clientY);
      if (!hit || hit.node !== null) return;
      const element = this.find(store, hit.id);
      if (element?.kind !== 'straightWire') return;

      const normal = new THREE.Vector3();
      scene3d.camera.getWorldDirection(normal);
      this.dragPlane.setFromNormalAndCoplanarPoint(
        normal,
        new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z),
      );
      const start = this.planePoint(event.clientX, event.clientY);
      if (!start) return;

      this.bodyDrag = {
        id: hit.id,
        base: (element.nodes ?? []).map((n) => ({ ...n })),
        offset: new THREE.Vector3(),
        last: start,
        active: true,
      };
      store.setDragging(true);
      scene3d.orbit.enabled = false;
    });

    scene3d.canvas.addEventListener('pointermove', (event: PointerEvent) => {
      const drag = this.bodyDrag;
      if (!drag?.active) return;
      const point = this.planePoint(event.clientX, event.clientY);
      if (!point) return;

      drag.offset.add(point.clone().sub(drag.last));
      drag.last.copy(point);
      const nodes = drag.base.map((n) => ({
        x: n.x + drag.offset.x,
        y: n.y + drag.offset.y,
        z: n.z + drag.offset.z,
      }));
      store.updateElement(drag.id, {
        nodes,
        position: { x: nodes[0].x, y: nodes[0].y, z: nodes[0].z },
      });
    });

    scene3d.canvas.addEventListener('pointerup', () => {
      if (!this.bodyDrag?.active) return;
      this.bodyDrag = null;
      store.setDragging(false);
      scene3d.orbit.enabled = true;
    });
    scene3d.canvas.addEventListener('pointerup', (event: PointerEvent) => {
      if (transform.dragging || transform.axis !== null) return;
      if (Math.hypot(event.clientX - this.downX, event.clientY - this.downY) > CLICK_SLOP_PX) return;
      const hit = this.pickAt(event.clientX, event.clientY);
      this.selectedNode = hit?.node ?? null;
      store.select(hit?.id ?? null);
    });
  }

  private find(store: SceneStore, id: string): SceneElement | undefined {
    return store.snapshot.elements.find((e) => e.id === id);
  }

  /** 屏幕坐标 -> 归一化设备坐标，并据此更新射线 */
  private castFrom(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  /** 命中的要素/节点；没命中返回 null */
  pickAt(clientX: number, clientY: number): ElementPick | null {
    this.castFrom(clientX, clientY);

    const targets: THREE.Object3D[] = [...this.simpleViews.values()];
    for (const [, view] of this.wireViews) {
      // 节点手柄常显，因此任何时候都能直接点中某个节点
      targets.push(view.body, ...view.handles.filter((h) => h.visible));
    }
    // 自由点电荷的笔头（含预览箭头）也直接可点选；它是 Object3D，所以要递归找子网格
    if (this.particleTargets) targets.push(this.particleTargets.object);

    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return null;
    // 命中点可能是子网格（粒子的笔头就是个 Object3D，网格是它的子节点），
    // 所以沿祖先链找挂了 id 的那一层
    let node: THREE.Object3D | null = hit.object;
    while (node && typeof node.userData.id !== 'string') node = node.parent;
    if (!node) return null;

    return {
      id: node.userData.id as string,
      node: (node.userData.node as number | undefined) ?? null,
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
    };
  }

  /** 射线与地面 y=0 的交点：右键「空白处添加」的落点 */
  pickGround(clientX: number, clientY: number): Vec3 | null {
    this.castFrom(clientX, clientY);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.groundPoint);
    return hit ? { x: hit.x, y: 0, z: hit.z } : null;
  }

  /** 射线与当前拖动平面的交点 */
  private planePoint(clientX: number, clientY: number): THREE.Vector3 | null {
    this.castFrom(clientX, clientY);
    const hit = this.raycaster.ray.intersectPlane(this.dragPlane, this.groundPoint);
    return hit ? hit.clone() : null;
  }

  setSelectedNode(index: number | null): void {
    this.selectedNode = index;
  }

  /**
   * 自由点电荷的笔头挂在 ParticleView 上，但「待放开」时它仍要能被移动/旋转。
   * 这里把笔头交给 TransformControls 当目标（object 为空表示当前没有粒子）。
   */
  setParticleTarget(id: string | null, object: THREE.Object3D | null): void {
    this.particleTargets = id && object ? { id, object } : null;
    // 射线命中后要靠 userData.id 找回是哪个要素，所以笔头也得挂上
    if (this.particleTargets) this.particleTargets.object.userData.id = id;
  }

  /** 与 store 对齐：新建/删除/移动要素，重建导线几何，并同步选中态与手柄 */
  sync(
    elements: readonly SceneElement[],
    selectedId: string | null,
    dragging: boolean,
    size: { width: number; height: number },
    wireTool: WireTool,
  ): void {
    const seen = new Set<string>();

    for (const el of elements) {
      seen.add(el.id);
      if (el.kind === 'straightWire') {
        let view = this.wireViews.get(el.id);
        if (!view) {
          view = new WireView(size);
          this.wireViews.set(el.id, view);
          this.scene.add(view.root);
        }
        view.update(el, dragging);
        view.setResolution(size.width, size.height);
      } else if (el.kind === 'freeCharge') {
        // 视觉（笔头 + 荧光笔拖尾）全在 ParticleView 里，这里不建网格
        continue;
      } else {
        let mesh = this.simpleViews.get(el.id);
        if (!mesh) {
          mesh = this.createMesh(el);
          this.simpleViews.set(el.id, mesh);
          this.scene.add(mesh);
        }
        this.applyAppearance(mesh, el);
        this.updateMeshShape(mesh, el);
        if (!dragging) mesh.position.set(el.position.x, el.position.y, el.position.z);
      }
    }

    for (const [id, mesh] of [...this.simpleViews]) {
      if (seen.has(id)) continue;
      if (this.transform.object === mesh) this.transform.detach();
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.simpleViews.delete(id);
    }
    for (const [id, view] of [...this.wireViews]) {
      if (seen.has(id)) continue;
      this.detachIfBelongs(view);
      this.scene.remove(view.root);
      view.dispose();
      this.wireViews.delete(id);
    }

    this.syncTransform(elements, selectedId, wireTool);
  }

  private detachIfBelongs(view: WireView): void {
    const object = this.transform.object;
    if (object === view.translateProxy || object === view.rotateProxy || view.handles.includes(object as THREE.Mesh)) {
      this.transform.detach();
    }
  }

  private syncTransform(
    elements: readonly SceneElement[],
    selectedId: string | null,
    wireTool: WireTool,
  ): void {
    const element = selectedId ? elements.find((e) => e.id === selectedId) : undefined;
    if (!element) {
      if (this.transform.object) this.transform.detach();
      return;
    }

    if (element.kind === 'straightWire') {
      const view = this.wireViews.get(element.id);
      if (!view) {
        this.transform.detach();
        return;
      }
      const handle = this.selectedNode !== null ? view.handles[this.selectedNode] : undefined;
      if (handle?.visible) {
        this.attach('node', handle, element.id);
      } else if (wireTool === 'rotate' && isTwoNodeCircle(element)) {
        // 旋转工具：改圆环所在平面（导线本身仍可直接拖动平移）
        this.attach('rotate', view.rotateProxy, element.id);
      } else {
        // 平移工具：整体移动整条导线（多段导线与圆环都适用）
        this.attach('translate', view.translateProxy, element.id);
      }
      return;
    }

    // 自由点电荷：笔头归 ParticleView，只有「待放开」时才挂 gizmo（飞行中拖动=瞬移）
    if (element.kind === 'freeCharge') {
      const held = readParticleRun(element.params.run) === 'held';
      const target =
        held && this.particleTargets?.id === element.id ? this.particleTargets.object : null;
      if (!target) {
        this.transform.detach();
        return;
      }
      this.attach(wireTool === 'rotate' ? 'rotate' : 'simple', target, element.id);
      return;
    }

    const mesh = this.simpleViews.get(element.id);
    if (!mesh) {
      this.transform.detach();
      return;
    }
    if (wireTool === 'rotate' && isRotatableElement(element)) {
      // 偶极子 / 螺线管：直接对整个网格做旋转，读它的四元数写回 direction
      this.attach('rotate', mesh, element.id);
    } else {
      this.attach('simple', mesh, element.id);
    }
  }

  private attach(kind: DragKind, object: THREE.Object3D, id: string): void {
    // 模式必须**每次**同步：导线在「移动/旋转」下挂的是两个不同的代理对象，
    // 但偶极子这类简单要素两种模式挂的是同一个网格——只认「对象变了没有」会让旋转
    // 工具永远切不过去（手柄还是平移箭头）。
    const mode = kind === 'rotate' ? 'rotate' : 'translate';
    if (this.transform.mode !== mode) this.transform.mode = mode;
    if (this.transform.object !== object) {
      this.transform.attach(object);
    }
    this.dragKind = kind;
    this.draggingId = id;
  }

  private createMesh(el: SceneElement): THREE.Mesh {
    const geometry =
      el.kind === 'solenoid'
        ? buildSolenoidGeometry(el)
        : el.kind === 'dipole'
          ? buildDipoleGeometry()
          : new THREE.SphereGeometry(SPHERE_RADIUS, 24, 16);

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 }),
    );
    mesh.userData.id = el.id;
    mesh.position.set(el.position.x, el.position.y, el.position.z);
    return mesh;
  }

  /** 外形随参数变化时需要重建（目前只有螺线管）；顺带同步朝向 */
  private updateMeshShape(mesh: THREE.Mesh, el: SceneElement): void {
    if (el.kind === 'solenoid') {
      const signature = `${el.params.n ?? 0}|${el.params.radius ?? 0}|${el.params.length ?? 0}`;
      if (this.meshShape.get(el.id) !== signature) {
        this.meshShape.set(el.id, signature);
        mesh.geometry.dispose();
        mesh.geometry = buildSolenoidGeometry(el);
      }
    }
    if (el.kind === 'solenoid' || el.kind === 'dipole') {
      const axis =
        el.kind === 'dipole'
          ? dipoleMomentAxis(el, new THREE.Vector3())
          : new THREE.Vector3(el.direction.x, el.direction.y, el.direction.z);
      if (axis.lengthSq() > 1e-9) mesh.quaternion.setFromUnitVectors(UP_AXIS, axis.normalize());
    }
  }

  private applyAppearance(mesh: THREE.Mesh, el: SceneElement): void {
    const material = mesh.material as THREE.MeshStandardMaterial;
    const color = elementColor(el.kind, el.params);
    if (material.color.getHex() !== color) {
      material.color.setHex(color);
      material.emissive.setHex(color);
    }
    material.emissiveIntensity = 0.35;
  }
}
