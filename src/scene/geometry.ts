import type { SceneElement, Vec3 } from './types';

/** 一段直线导线：起点 a、单位方向 dir、长度 len */
export interface WireSegment {
  a: Vec3;
  dir: Vec3;
  len: number;
}

/** 「延伸到无穷远」用的等效长度：相对场景尺度（~10）足够大，double 精度绰绰有余 */
export const INFINITE_LENGTH = 1e6;

/** 2 节点闭合时把圆离散成多少段 */
const CIRCLE_SEGMENTS = 32;

const sub = (p: Vec3, q: Vec3): Vec3 => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const add = (p: Vec3, q: Vec3): Vec3 => ({ x: p.x + q.x, y: p.y + q.y, z: p.z + q.z });
const scale = (p: Vec3, s: number): Vec3 => ({ x: p.x * s, y: p.y * s, z: p.z * s });
const dot = (p: Vec3, q: Vec3): number => p.x * q.x + p.y * q.y + p.z * q.z;
const cross = (p: Vec3, q: Vec3): Vec3 => ({
  x: p.y * q.z - p.z * q.y,
  y: p.z * q.x - p.x * q.z,
  z: p.x * q.y - p.y * q.x,
});
export const norm = (p: Vec3): number => Math.hypot(p.x, p.y, p.z);
export const normalize = (p: Vec3): Vec3 => {
  const n = norm(p);
  return n > 1e-12 ? scale(p, 1 / n) : { x: 0, y: 0, z: 0 };
};

/** 两节点闭合 = 圆环（可旋转平面） */
export function isTwoNodeCircle(element: SceneElement): boolean {
  return (
    element.kind === 'straightWire' && isClosedWire(element) && (element.nodes?.length ?? 0) === 2
  );
}

export function isClosedWire(element: SceneElement): boolean {
  return (element.params.closed ?? 0) > 0.5;
}

export function wireNodes(element: SceneElement): Vec3[] {
  return element.nodes ?? [];
}

/** 圆环离散：以两节点连线为直径，法向优先取 direction（并强制垂直于该直径） */
function circleSegments(a: Vec3, b: Vec3, normal: Vec3): WireSegment[] {
  const center = scale(add(a, b), 0.5);
  const radius = norm(sub(b, a)) * 0.5;
  if (radius < 1e-6) return [];

  const u = normalize(sub(b, a));
  // 法向必须垂直于直径，否则"以 AB 为直径的圆"不存在；把用户给的法向投影到垂面
  let n = sub(normal, scale(u, dot(normal, u)));
  if (norm(n) < 1e-6) n = cross(u, { x: 0, y: 1, z: 0 }); // 退化：换一个参考轴
  if (norm(n) < 1e-6) n = cross(u, { x: 0, y: 0, z: 1 });
  const nHat = normalize(n);
  const v = normalize(cross(nHat, u));

  const at = (k: number): Vec3 => {
    const t = (2 * Math.PI * k) / CIRCLE_SEGMENTS;
    return add(center, add(scale(u, radius * Math.cos(t)), scale(v, radius * Math.sin(t))));
  };

  const out: WireSegment[] = [];
  for (let k = 0; k < CIRCLE_SEGMENTS; k += 1) {
    const p0 = at(k);
    const p1 = at(k + 1);
    const d = sub(p1, p0);
    const len = norm(d);
    if (len > 1e-9) out.push({ a: p0, dir: scale(d, 1 / len), len });
  }
  return out;
}

/**
 * 把一条导线要素展开成若干直线段（供 C++ 的段场使用）。
 *
 * | 情形 | 结果 |
 * |---|---|
 * | 开放 | 中间各段 + 首段向前、末段向后各延伸一段「无限长」 |
 * | 闭合 2 节点 | 连线为直径的圆，离散成多段 |
 * | 闭合 >2 节点 | 各段 + 末→首闭合段 |
 */
export function wireSegments(element: SceneElement): WireSegment[] {
  const nodes = wireNodes(element);
  if (nodes.length < 2) return [];

  if (isClosedWire(element) && nodes.length === 2) {
    return circleSegments(nodes[0], nodes[1], element.direction);
  }

  const out: WireSegment[] = [];
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    const d = sub(nodes[i + 1], nodes[i]);
    const len = norm(d);
    if (len > 1e-9) out.push({ a: nodes[i], dir: scale(d, 1 / len), len });
  }

  if (isClosedWire(element)) {
    const d = sub(nodes[0], nodes[nodes.length - 1]);
    const len = norm(d);
    if (len > 1e-9) out.push({ a: nodes[nodes.length - 1], dir: scale(d, 1 / len), len });
  } else {
    // 开放导线：两头沿相邻节点连线延伸到无穷远（电流从无穷远流入、流向无穷远）
    const u = normalize(sub(nodes[1], nodes[0]));
    if (norm(u) > 1e-9) {
      // 首端延伸：几何要从很远处**指向** node0，这样电流方向才与主段一致。
      // （早先把 dir 写成向外的 −u，结果接头处两段场互相抵消，实测 |B| ~ 1e-23）
      out.unshift({
        a: sub(nodes[0], scale(u, INFINITE_LENGTH)),
        dir: u,
        len: INFINITE_LENGTH,
      });
    }
    const last = nodes.length - 1;
    const v = normalize(sub(nodes[last], nodes[last - 1]));
    if (norm(v) > 1e-9) {
      // 末端延伸：从 nodeN 继续向外
      out.push({ a: nodes[last], dir: v, len: INFINITE_LENGTH });
    }
  }
  return out;
}

/**
 * 导线的「中心线」点列（用于渲染与撒种子）：闭合时末点 = 首点。
 * 与 wireSegments 不同，这里不含无限延伸段。
 */
export function wireCenterline(element: SceneElement): { points: Vec3[]; closed: boolean } {
  const nodes = wireNodes(element);
  if (isClosedWire(element) && nodes.length === 2) {
    const segs = circleSegments(nodes[0], nodes[1], element.direction);
    const points: Vec3[] = [];
    if (segs.length > 0) {
      points.push(segs[0].a);
      for (const s of segs) points.push(add(s.a, scale(s.dir, s.len)));
    }
    return { points, closed: true };
  }
  return { points: [...nodes], closed: isClosedWire(element) && nodes.length > 2 };
}
