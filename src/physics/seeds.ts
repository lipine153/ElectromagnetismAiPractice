import type { SceneElement } from '../scene/types';

const SEEDS_PER_CHARGE = 12;
const SEED_RADIUS = 0.15;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** 球面近似均匀撒点（Fibonacci 球） */
function fibonacciSphere(n: number, radius: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    out.push([radius * Math.cos(theta) * r, radius * Math.sin(theta) * r, radius * y]);
  }
  return out;
}

/**
 * 生成追踪用的种子点，stride 4 = [x, y, z, sign]。
 *
 * 对**每一个**电荷都在其周围撒种子，并沿各自极性向外追（正电荷顺场、负电荷逆场）。
 * 早先只在正电荷撒种子，导致负电荷一侧只有线汇入、没有线发出，正负两端看起来不对称；
 * 现在两端都有对称的场线扇面。
 */
export function buildSeeds(elements: readonly SceneElement[]): Float64Array {
  const charges = elements.filter((e) => e.kind === 'charge' && (e.params.q ?? 0) !== 0);
  if (charges.length === 0) return new Float64Array(0);

  const out = new Float64Array(charges.length * SEEDS_PER_CHARGE * 4);
  let k = 0;
  for (const charge of charges) {
    const sign = (charge.params.q ?? 0) >= 0 ? 1 : -1;
    for (const [dx, dy, dz] of fibonacciSphere(SEEDS_PER_CHARGE, SEED_RADIUS)) {
      out[k] = charge.position.x + dx;
      out[k + 1] = charge.position.y + dy;
      out[k + 2] = charge.position.z + dz;
      out[k + 3] = sign;
      k += 4;
    }
  }
  return out;
}
