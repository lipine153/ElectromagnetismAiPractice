import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

import { elementColor } from '../scene/catalog';
import type { SceneStore } from '../scene/store';
import type { SceneElement } from '../scene/types';
import type { Scene3D } from './scene3d';

const SPHERE_RADIUS = 0.12;
const VELOCITY_SMOOTHING = 0.35;
const CLICK_SLOP_PX = 4;

/** 场景里每个要素的 3D 表示 + 选中/拖拽（TransformControls） */
export class ElementViews {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly transform: TransformControls;
  private readonly views = new Map<string, THREE.Mesh>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly lastPos = new THREE.Vector3();
  private lastTime = 0;
  private downX = 0;
  private downY = 0;

  constructor(scene3d: Scene3D, store: SceneStore) {
    this.scene = scene3d.scene;
    this.camera = scene3d.camera;

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
        this.lastPos.copy(transform.object?.position ?? new THREE.Vector3());
        this.lastTime = performance.now();
      } else {
        const id = transform.object?.userData.id as string | undefined;
        // 松手即清零速度，避免残留的 v×B 项
        if (id) store.updateElement(id, { velocity: { x: 0, y: 0, z: 0 } });
      }
    });

    transform.addEventListener('objectChange', () => {
      const obj = transform.object;
      if (!obj) return;
      const id = obj.userData.id as string;

      const now = performance.now();
      const dt = Math.max(1e-3, (now - this.lastTime) / 1000);
      const current = store.snapshot.elements.find((e) => e.id === id)?.velocity ?? { x: 0, y: 0, z: 0 };
      const a = VELOCITY_SMOOTHING;
      const instX = (obj.position.x - this.lastPos.x) / dt;
      const instY = (obj.position.y - this.lastPos.y) / dt;
      const instZ = (obj.position.z - this.lastPos.z) / dt;

      store.updateElement(id, {
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        velocity: {
          x: current.x + a * (instX - current.x),
          y: current.y + a * (instY - current.y),
          z: current.z + a * (instZ - current.z),
        },
      });

      this.lastPos.copy(obj.position);
      this.lastTime = now;
    });

    // 点选：用「按下 / 抬起」位移区分点选和转视角
    scene3d.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
      this.downX = event.clientX;
      this.downY = event.clientY;
    });
    scene3d.canvas.addEventListener('pointerup', (event: PointerEvent) => {
      if (transform.dragging || transform.axis !== null) return;
      if (Math.hypot(event.clientX - this.downX, event.clientY - this.downY) > CLICK_SLOP_PX) return;
      store.select(this.pick(event));
    });
  }

  private pick(event: PointerEvent): string | null {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.views.values()], false)[0];
    return hit ? (hit.object.userData.id as string) : null;
  }

  /** 与 store 对齐：新建/删除/移动要素网格，并同步选中态 */
  sync(elements: readonly SceneElement[], selectedId: string | null, dragging: boolean): void {
    const seen = new Set<string>();

    for (const el of elements) {
      seen.add(el.id);
      let mesh = this.views.get(el.id);
      if (!mesh) {
        mesh = this.createMesh(el);
        this.views.set(el.id, mesh);
        this.scene.add(mesh);
      }
      this.applyAppearance(mesh, el);
      // 拖拽中由 TransformControls 主导位置，不要回写
      if (!dragging) mesh.position.set(el.position.x, el.position.y, el.position.z);
    }

    for (const [id, mesh] of [...this.views]) {
      if (seen.has(id)) continue;
      if (this.transform.object === mesh) this.transform.detach();
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.views.delete(id);
    }

    const selected = selectedId ? this.views.get(selectedId) : undefined;
    if (selected && this.transform.object !== selected) this.transform.attach(selected);
    if (!selected && this.transform.object) this.transform.detach();
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
