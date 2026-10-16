import { norm, normalize, wireCenterline } from '../scene/geometry';
import type { SceneElement, Vec3 } from '../scene/types';

const SEED_RADIUS = 0.15;

/**
 * 种子方向集合（单位球面）。
 *
 * 关键约束：**点集本身必须具备镜像对称性**，否则即使场是对称的，画出来也会歪。
 * 早先用 Fibonacci 球面撒点（只保证均匀）导致电偶极子左右对不上（实测 24 个方向里
 * 只有 4 个关于 x→−x 对称、追踪后 0 条曲线能镜像配对）。
 *
 * 这里改用**测地线球**：把正二十面体的 20 个三角面按 frequency 细分后归一化。
 * 二十面体及其细分都具备完整的二十面体对称性（含 x→−x、y→−y、z→−z 及坐标轮换），
 * 所以点集天然满足对称性要求；frequency 越大，方向越多越密。
 */

const PHI = (1 + Math.sqrt(5)) / 2;

/** 正二十面体的 12 个顶点（未归一化） */
const ICO_VERTICES: ReadonlyArray<readonly [number, number, number]> = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
];

/** 20 个三角面（顶点下标） */
const ICO_FACES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/** 测地线球：二十面体三角面按 frequency 细分，顶点归一化到单位球并去重 */
function geodesicDirections(frequency: number): Array<[number, number, number]> {
  const unique = new Map<string, [number, number, number]>();

  const push = (x: number, y: number, z: number): void => {
    const norm = Math.hypot(x, y, z);
    const p: [number, number, number] = [x / norm, y / norm, z / norm];
    const key = `${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, p);
  };

  for (const [ia, ib, ic] of ICO_FACES) {
    const a = ICO_VERTICES[ia];
    const b = ICO_VERTICES[ib];
    const c = ICO_VERTICES[ic];
    for (let i = 0; i <= frequency; i += 1) {
      for (let j = 0; j <= frequency - i; j += 1) {
        const k = frequency - i - j;
        push(
          (a[0] * i + b[0] * j + c[0] * k) / frequency,
          (a[1] * i + b[1] * j + c[1] * k) / frequency,
          (a[2] * i + b[2] * j + c[2] * k) / frequency,
        );
      }
    }
  }

  return [...unique.values()];
}

/** 三档线密度：12 / 42 / 92 个方向，逐级更密（都是对称点集） */
export const DENSITY_LEVELS: ReadonlyArray<ReadonlyArray<[number, number, number]>> = [
  geodesicDirections(1),
  geodesicDirections(2),
  geodesicDirections(3),
];

export const DENSITY_LABELS = ['疏', '中', '密'];

/** 把 level 夹到合法档位 */
export function clampDensity(level: number): number {
  return Math.min(DENSITY_LEVELS.length - 1, Math.max(0, Math.round(level)));
}

/**
 * 生成追踪用的种子点，stride 4 = [x, y, z, sign]。
 *
 * 每个电荷都在其周围撒种子，并沿各自极性向外追（正电荷顺场、负电荷逆场），
 * 这样正负两端都有对称的场线扇面。
 */
export function buildSeeds(elements: readonly SceneElement[], level = 0): Float64Array {
  const directions = DENSITY_LEVELS[clampDensity(level)];
  const charges = elements.filter((e) => e.kind === 'charge' && (e.params.q ?? 0) !== 0);
  if (charges.length === 0) return new Float64Array(0);

  const out = new Float64Array(charges.length * directions.length * 4);
  let k = 0;
  for (const charge of charges) {
    const sign = (charge.params.q ?? 0) >= 0 ? 1 : -1;
    for (const [dx, dy, dz] of directions) {
      out[k] = charge.position.x + dx * SEED_RADIUS;
      out[k + 1] = charge.position.y + dy * SEED_RADIUS;
      out[k + 2] = charge.position.z + dz * SEED_RADIUS;
      out[k + 3] = sign;
      k += 4;
    }
  }
  return out;
}

// ===================== 导线的磁场线种子 =====================

/** 沿导线撒种子的档位：沿程位置数 / 半径组 / 两端延伸处采样数 */
const WIRE_SEED_LEVELS = [
  { along: 5, radii: [0.35, 0.7], extend: 2 },
  { along: 7, radii: [0.35, 0.7, 1.1], extend: 3 },
  { along: 9, radii: [0.3, 0.55, 0.85, 1.2], extend: 4 },
];

const sub = (p: Vec3, q: Vec3): Vec3 => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const cross = (p: Vec3, q: Vec3): Vec3 => ({
  x: p.y * q.z - p.z * q.y,
  y: p.z * q.x - p.x * q.z,
  z: p.x * q.y - p.y * q.x,
});

/** 与切线垂直的一对正交方向 */
function perpendicularBasis(t: Vec3): [Vec3, Vec3] {
  const ref: Vec3 = Math.abs(t.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(t, ref));
  const v = normalize(cross(t, u));
  return [u, v];
}

/** 沿折线按参数 t∈[0,1] 取点与切线 */
function samplePolyline(
  points: readonly Vec3[],
  closed: boolean,
  t: number,
): { base: Vec3; tangent: Vec3 } | null {
  const pts = closed ? [...points, points[0]] : [...points];
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    segs.push(d);
    total += d;
  }
  if (!(total > 1e-9)) return null;

  let target = t * total;
  for (let i = 1; i < pts.length; i += 1) {
    const d = segs[i - 1];
    if (target <= d || i === pts.length - 1) {
      const f = d > 1e-12 ? Math.min(1, target / d) : 0;
      const p0 = pts[i - 1];
      const p1 = pts[i];
      return {
        base: {
          x: p0.x + (p1.x - p0.x) * f,
          y: p0.y + (p1.y - p0.y) * f,
          z: p0.z + (p1.z - p0.z) * f,
        },
        tangent: normalize(sub(p1, p0)),
      };
    }
    target -= d;
  }
  return null;
}

/**
 * 通电导线的磁场线种子：沿导线中心线取若干位置、在每个位置的**垂直平面**内按
 * 若干半径偏移撒点。追踪出来就是环绕导线的闭合磁力线。
 *
 * 每个 (沿程位置, 半径) 只放一个种子——同一半径绕导线一圈本就是同一条磁力线，
 * 多放只会重复绘制。
 */
export function buildMagneticSeeds(elements: readonly SceneElement[], level = 0): Float64Array {
  const cfg = WIRE_SEED_LEVELS[clampDensity(level)];
  const out: number[] = [];

  const pushPoint = (p: Vec3): void => {
    out.push(p.x, p.y, p.z, 1);
  };
  const pushSeed = (base: Vec3, tangent: Vec3, radius: number): void => {
    const [u] = perpendicularBasis(tangent);
    pushPoint({ x: base.x + u.x * radius, y: base.y + u.y * radius, z: base.z + u.z * radius });
  };

  for (const element of elements) {
    if (element.kind === 'solenoid') {
      // 管内、管外都要撒；而且必须**绕轴多个方位**，否则所有线都会挤在同一个子午面里
      if ((element.params.i ?? 0) === 0) continue;
      const axis = normalize(element.direction);
      const radius = element.params.radius ?? 0.5;
      const length = element.params.length ?? 2;
      if (norm(axis) < 1e-9) continue;

      const [u, v] = perpendicularBasis(axis);
      const along = 4;
      const azimuths = 6;
      for (let k = 0; k < along; k += 1) {
        const t = (k + 0.5) / along;
        const base = {
          x: element.position.x + axis.x * (t - 0.5) * length,
          y: element.position.y + axis.y * (t - 0.5) * length,
          z: element.position.z + axis.z * (t - 0.5) * length,
        };
        for (const factor of [0.35, 1.5]) {
          for (let a = 0; a < azimuths; a += 1) {
            const angle = (2 * Math.PI * a) / azimuths;
            const r = radius * factor;
            const cos = Math.cos(angle) * r;
            const sin = Math.sin(angle) * r;
            pushPoint({
              x: base.x + u.x * cos + v.x * sin,
              y: base.y + u.y * cos + v.y * sin,
              z: base.z + u.z * cos + v.z * sin,
            });
          }
        }
      }
      continue;
    }

    if (element.kind === 'dipole') {
      if ((element.params.m ?? 0) === 0) continue;
      // 点偶极子：用**完整**的对称方向集撒种（不能抽子集，抽出来就不对称了）
      const directions = DENSITY_LEVELS[clampDensity(level) === 2 ? 1 : 0];
      const radii = [0.6, 1.2];
      for (const [dx, dy, dz] of directions) {
        for (const radius of radii) {
          pushPoint({
            x: element.position.x + dx * radius,
            y: element.position.y + dy * radius,
            z: element.position.z + dz * radius,
          });
        }
      }
      continue;
    }

    if (element.kind !== 'straightWire' || (element.params.i ?? 0) === 0) continue;

    const { points, closed } = wireCenterline(element);
    if (points.length < 2) continue;

    for (let k = 0; k < cfg.along; k += 1) {
      const t = closed ? (k + 0.5) / cfg.along : k / Math.max(1, cfg.along - 1);
      const sample = samplePolyline(points, closed, t);
      if (!sample) continue;
      for (const radius of cfg.radii) pushSeed(sample.base, sample.tangent, radius);
    }

    // 开放导线：两端延伸段方向上也补几颗，否则延伸出去的那段导线附近没有磁力线
    if (!closed) {
      const head = points[0];
      const tail = points[points.length - 1];
      const headDir = normalize(sub(head, points[1]));
      const tailDir = normalize(sub(tail, points[points.length - 2]));
      for (let k = 1; k <= cfg.extend; k += 1) {
        const distance = k * 1.2;
        pushSeed(
          { x: head.x + headDir.x * distance, y: head.y + headDir.y * distance, z: head.z + headDir.z * distance },
          headDir,
          cfg.radii[0],
        );
        pushSeed(
          { x: tail.x + tailDir.x * distance, y: tail.y + tailDir.y * distance, z: tail.z + tailDir.z * distance },
          tailDir,
          cfg.radii[0],
        );
      }
    }
  }

  return new Float64Array(out);
}
