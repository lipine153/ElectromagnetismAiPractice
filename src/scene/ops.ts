import type { SceneStore } from './store';
import type { Vec3 } from './types';

const sub = (p: Vec3, q: Vec3): Vec3 => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const add = (p: Vec3, q: Vec3): Vec3 => ({ x: p.x + q.x, y: p.y + q.y, z: p.z + q.z });
const len = (p: Vec3): number => Math.hypot(p.x, p.y, p.z);

const nodesOf = (store: SceneStore, id: string): Vec3[] =>
  store.snapshot.elements.find((e) => e.id === id)?.nodes ?? [];

/** 在 index 之后插入一个节点：与下一个节点的中点；若是末尾则沿末段方向外推同样长度 */
export function addNodeAfter(store: SceneStore, id: string, index: number): void {
  const nodes = nodesOf(store, id);
  if (nodes.length < 2) return;

  const current = nodes[index];
  const next = nodes[index + 1];
  const inserted =
    next !== undefined
      ? { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2, z: (current.z + next.z) / 2 }
      : (() => {
          const prev = nodes[index - 1] ?? current;
          const d = sub(current, prev);
          return add(current, d);
        })();

  const updated = [...nodes];
  updated.splice(index + 1, 0, inserted);
  store.updateElement(id, { nodes: updated });
}

/** 删除节点（至少保留 2 个） */
export function removeNode(store: SceneStore, id: string, index: number): void {
  const nodes = nodesOf(store, id);
  if (nodes.length <= 2) return;
  const updated = nodes.filter((_, i) => i !== index);
  store.updateElement(id, { nodes: updated });
}

/** 在给定世界点插入节点：挂到最近的那条线段上 */
export function insertNodeAt(store: SceneStore, id: string, point: Vec3): void {
  const nodes = nodesOf(store, id);
  if (nodes.length < 2) return;

  let bestSegment = 0;
  let bestDistance = Infinity;
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const ab = sub(b, a);
    const length = len(ab);
    if (!(length > 1e-9)) continue;
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y + (point.z - a.z) * ab.z) / (length * length)),
    );
    const closest = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
    const distance = len(sub(point, closest));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSegment = i;
    }
  }

  const updated = [...nodes];
  updated.splice(bestSegment + 1, 0, { ...point });
  store.updateElement(id, { nodes: updated });
}

/** 在导线末端追加一个节点（工作栏「添加节点」用） */
export function appendNode(store: SceneStore, id: string): void {
  const nodes = nodesOf(store, id);
  if (nodes.length < 2) return;
  addNodeAfter(store, id, nodes.length - 1);
}
