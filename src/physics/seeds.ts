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
 * 策略：优先从正电荷向外「顺场」追；若场景里没有正电荷，则从负电荷「逆场」追，
 * 画出来的效果同样是向外的场线，且避免同一条线被画两遍。
 */
export function buildSeeds(elements: readonly SceneElement[]): Float64Array {
  const charges = elements.filter((e) => e.kind === 'charge');
  const positives = charges.filter((e) => (e.params.q ?? 0) >= 0);
  const anchors = positives.length > 0 ? positives : charges;
  const sign = positives.length > 0 ? 1 : -1;

  if (anchors.length === 0) return new Float64Array(0);

  const out = new Float64Array(anchors.length * SEEDS_PER_CHARGE * 4);
  let k = 0;
  for (const anchor of anchors) {
    for (const [dx, dy, dz] of fibonacciSphere(SEEDS_PER_CHARGE, SEED_RADIUS)) {
      out[k] = anchor.position.x + dx;
      out[k + 1] = anchor.position.y + dy;
      out[k + 2] = anchor.position.z + dz;
      out[k + 3] = sign;
      k += 4;
    }
  }
  return out;
}
