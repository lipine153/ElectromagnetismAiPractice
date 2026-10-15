import type { SceneElement } from '../scene/types';

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
