import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

import { elementColor } from '../scene/catalog';
import { isClosedWire } from '../scene/geometry';
import type { SceneStore } from '../scene/store';
import type { SceneElement, Vec3 } from '../scene/types';
import type { Scene3D } from './scene3d';
import { WireView } from './wireView';

const SPHERE_RADIUS = 0.12;
const VELOCITY_SMOOTHING = 0.35;
const CLICK_SLOP_PX = 4;

/** 拾取结果：命中的要素、命中的节点下标（导线才有）、命中点 */
export interface ElementPick {
  id: string;
  node: number | null;
  point: Vec3;
}

type DragKind = 'none' | 'node' | 'translate' | 'rotate' | 'simple';

const isTwoNodeCircle = (element: SceneElement): boolean =>
  element.kind === 'straightWire' &&
  isClosedWire(element) &&
  (element.nodes?.length ?? 0) === 2;

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
  /** 折线要素：导线 */
  private readonly wireViews = new Map<string, WireView>();

  private selectedNode: number | null = null;
  private dragKind: DragKind = 'none';
  private draggingId: string | null = null;
  private dragBase: Vec3[] = [];
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
        nodes[index] = { x: object.position.x, y: object.position.y, z: object.position.z };
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
        // 只改圆所在平面的法向；直径（两个节点）保持不动
        const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion);
        store.updateElement(id as string, {
          direction: { x: normal.x, y: normal.y, z: normal.z },
        });
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

    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    return {
      id: hit.object.userData.id as string,
      node: (hit.object.userData.node as number | undefined) ?? null,
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

  /** 与 store 对齐：新建/删除/移动要素，重建导线几何，并同步选中态与手柄 */
  sync(
    elements: readonly SceneElement[],
    selectedId: string | null,
    dragging: boolean,
    size: { width: number; height: number },
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
        view.update(el);
        view.setResolution(size.width, size.height);
      } else {
        let mesh = this.simpleViews.get(el.id);
        if (!mesh) {
          mesh = this.createMesh(el);
          this.simpleViews.set(el.id, mesh);
          this.scene.add(mesh);
        }
        this.applyAppearance(mesh, el);
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

    this.syncTransform(elements, selectedId);
  }

  private detachIfBelongs(view: WireView): void {
    const object = this.transform.object;
    if (object === view.translateProxy || object === view.rotateProxy || view.handles.includes(object as THREE.Mesh)) {
      this.transform.detach();
    }
  }

  private syncTransform(elements: readonly SceneElement[], selectedId: string | null): void {
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
      } else if (isTwoNodeCircle(element)) {
        // 圆环：旋转手柄改平面方向；整体平移靠直接拖动导线本体
        this.attach('rotate', view.rotateProxy, element.id);
      } else {
        // 其它导线不给 gizmo，直接拖动本体即可移动
        if (this.transform.object) this.transform.detach();
      }
      return;
    }

    const mesh = this.simpleViews.get(element.id);
    if (mesh) this.attach('simple', mesh, element.id);
    else this.transform.detach();
  }

  private attach(kind: DragKind, object: THREE.Object3D, id: string): void {
    if (this.transform.object !== object) {
      this.transform.mode = kind === 'rotate' ? 'rotate' : 'translate';
      this.transform.attach(object);
    }
    this.dragKind = kind;
    this.draggingId = id;
  }

  private createMesh(el: SceneElement): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(SPHERE_RADIUS, 24, 16),
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 }),
    );
    mesh.userData.id = el.id;
    mesh.position.set(el.position.x, el.position.y, el.position.z);
    return mesh;
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
