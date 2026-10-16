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

/** 六个坐标轴方向 */
const AXIS_DIRECTIONS: Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/**
 * 方向接近某个坐标轴时吸附过去，否则返回 null。
 *
 * 「导线垂直于 xOy 平面」= 导线方向平行于 z 轴，所以轴吸附正好覆盖
 * 「垂直于三个坐标平面」这几种姿态；圆环那边吸的是它的法向（法向沿轴 ⟺ 圆面垂直于对应轴）。
 */
export function snapDirectionToAxis(direction: Vec3, maxAngleDeg = 12): Vec3 | null {
  const unit = normalize(direction);
  if (norm(unit) < 1e-9) return null;

  const cosLimit = Math.cos((maxAngleDeg * Math.PI) / 180);
  let best: Vec3 | null = null;
  let bestDot = cosLimit;
  for (const axis of AXIS_DIRECTIONS) {
    const alignment = dot(unit, axis);
    if (alignment > bestDot) {
      bestDot = alignment;
      best = axis;
    }
  }
  return best ? { ...best } : null;
}

/** 把点投影到「过 origin 沿 axis」的直线上（保持在该轴上滑动，不偏离） */
export function projectOntoAxis(point: Vec3, origin: Vec3, axis: Vec3): Vec3 {
  const offset = sub(point, origin);
  return add(origin, scale(axis, dot(offset, axis)));
}

/** 四元数 (w,x,y,z) 旋转向量（与 three 的 applyQuaternion 同约定） */
export function applyQuat(v: Vec3, q: readonly [number, number, number, number]): Vec3 {
  const [w, qx, qy, qz] = q;
  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);
  return {
    x: v.x + w * tx + (qy * tz - qz * ty),
    y: v.y + w * ty + (qz * tx - qx * tz),
    z: v.z + w * tz + (qx * ty - qy * tx),
  };
}

/**
 * 圆环绕**圆心**的整体刚性旋转 —— 「绕圆心旋转」的全部几何都在这里。
 *
 * 圆心不动，直径两端与法向一起转；只改法向的话圆环就变成绕直径转动（被两个节点钉住），
 * 而且绕法向自转时法向不变、圆环会完全不响应。
 *
 * `quat` 是**相对拖拽起点**的旋转量 Δ（TransformControls 在世界空间是左乘 q = Δ·q₀，
 * 所以 Δ = q·q₀⁻¹）；`nodes` / `direction` 传拖拽起点的快照，每帧都从起点重算，不逐帧累积。
 * 法向接近坐标轴时吸附过去，此时把直径投影回垂面，保持「法向 ⟂ 直径」这个不变式。
 */
export function rotateLoop(
  nodes: readonly Vec3[],
  direction: Vec3,
  quat: readonly [number, number, number, number],
  maxSnapAngleDeg = 12,
): { nodes: [Vec3, Vec3]; direction: Vec3 } | null {
  if (nodes.length !== 2) return null;
  const center = scale(add(nodes[0], nodes[1]), 0.5);
  const half0 = scale(sub(nodes[1], nodes[0]), 0.5);
  const radius = norm(half0);
  if (radius < 1e-9) return null;

  const normalRaw = normalize(applyQuat(direction, quat));
  const snapped = snapDirectionToAxis(normalRaw, maxSnapAngleDeg);
  const normal = snapped ?? normalRaw;

  let half = applyQuat(half0, quat);
  if (snapped) half = sub(half, scale(normal, dot(half, normal)));
  if (norm(half) < 1e-9) half = cross(normal, { x: 0, y: 0, z: 1 });
  if (norm(half) < 1e-9) half = cross(normal, { x: 1, y: 0, z: 0 });
  half = scale(half, radius / norm(half));

  return { nodes: [sub(center, half), add(center, half)], direction: normal };
}

/** 圆环电流源（螺线管展开成一叠这种环） */
export interface LoopSource {
  center: Vec3;
  normal: Vec3;
  radius: number;
  current: number;
}

/** 每个螺线管最多展开成多少个圆环（每个圆环 = 一个场源） */
const MAX_SOLENOID_LOOPS = 60;

/**
 * 螺线管 → 一叠同轴圆环。每个环带**完整的 I**（串联绕组的电流处处相同），
 * 于是内部 B = μ0·(N/L)·I = μ0·n·I ✓，C++ 侧不需要知道"螺线管"这个概念。
 */
export function solenoidLoops(element: SceneElement): LoopSource[] {
  const current = element.params.i ?? 0;
  const turnsPerMeter = element.params.n ?? 0;
  const radius = element.params.radius ?? 0;
  const length = element.params.length ?? 0;
  if (current === 0 || turnsPerMeter <= 0 || radius <= 0 || length <= 0) return [];

  const turns = Math.max(2, Math.min(MAX_SOLENOID_LOOPS, Math.round(turnsPerMeter * length)));
  // 建模环数被上限压缩时，每环电流要按比例放大，保证总安匝数不变：
  // 等效面电流密度 K = n·I 必须保持，否则内部 B = μ0 n I 会差很大一截。
  const loopCurrent = current * ((turnsPerMeter * length) / turns);

  const normal = normalize(element.direction);
  if (norm(normal) < 1e-9) return [];

  const out: LoopSource[] = [];
  for (let k = 0; k < turns; k += 1) {
    const t = turns === 1 ? 0.5 : k / (turns - 1);
    out.push({
      center: add(element.position, scale(normal, (t - 0.5) * length)),
      normal,
      radius,
      current: loopCurrent,
    });
  }
  return out;
}

/** 该要素是否需要「移动/旋转」工具切换（即它的姿态有意义） */
export function isRotatableElement(element: SceneElement): boolean {
  if (element.kind === 'straightWire') return isTwoNodeCircle(element);
  // 自由电荷：旋转工具用来瞄初速度方向
  return element.kind === 'solenoid' || element.kind === 'dipole' || element.kind === 'freeCharge';
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
