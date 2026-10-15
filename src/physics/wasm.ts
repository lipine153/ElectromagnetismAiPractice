import { SOURCE_KIND, SOURCE_STRIDE, type SceneElement, type Vec3 } from '../scene/types';

export interface TraceOptions {
  step: number;
  maxSteps: number;
  maxRadius: number;
  /** 距源小于该值即收线 */
  stopRadius: number;
}

export interface TracedLine {
  /** 在 data 中的起始 float 下标 */
  offset: number;
  count: number;
}

export interface TracedLines {
  /** 紧凑排列：每点 4 个 float —— x, y, z, |F| */
  data: Float32Array;
  lines: TracedLine[];
}

const MAX_SOURCES = 256;
const MAX_SEEDS = 1024;

/** 把要素参数映射到 wasm 侧的 (p0, p1)，与 cpp/include/source.hpp 对应 */
function packParams(el: SceneElement): [number, number] {
  switch (el.kind) {
    case 'charge':
      return [el.params.q ?? 0, 0];
    case 'straightWire':
      return [el.params.i ?? 0, 0];
    case 'currentLoop':
      return [el.params.i ?? 0, el.params.radius ?? 0];
    case 'solenoid':
      return [el.params.i ?? 0, el.params.turnsPerLength ?? 0];
    case 'dipole':
      return [el.params.m ?? 0, 0];
    case 'capacitor':
      return [el.params.q ?? 0, el.params.dqdt ?? 0];
  }
}

/** base64 -> 字节；离线单文件构建时用来把内嵌的 wasm 交给胶水 */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 对 cpp/ 里那份场引擎的封装。所有跨界调用都在这里。 */
export class FieldEngine {
  private readonly module: FieldLineModuleInstance;
  private readonly sourcePtr: number;
  private readonly seedPtr: number;
  private readonly evalPtr: number;

  private constructor(module: FieldLineModuleInstance) {
    this.module = module;
    this.sourcePtr = module._malloc(MAX_SOURCES * SOURCE_STRIDE * 8);
    this.seedPtr = module._malloc(MAX_SEEDS * 4 * 8);
    this.evalPtr = module._malloc(6 * 8);
  }

  static async load(): Promise<FieldEngine> {
    // 离线单文件构建会注入 window.__FIELD_LINE_WASM__，直接喂给胶水即可免去 fetch
    const inlineWasm = typeof window !== 'undefined' ? window.__FIELD_LINE_WASM__ : undefined;
    const module = await FieldLineModule(inlineWasm ? { wasmBinary: decodeBase64(inlineWasm) } : undefined);
    return new FieldEngine(module);
  }

  /** 用当前要素整体替换场源列表 */
  upload(elements: readonly SceneElement[]): void {
    const count = Math.min(elements.length, MAX_SOURCES);
    const view = new Float64Array(this.module.HEAPF64.buffer, this.sourcePtr, count * SOURCE_STRIDE);
    for (let i = 0; i < count; i += 1) {
      const el = elements[i];
      const o = i * SOURCE_STRIDE;
      view[o] = SOURCE_KIND[el.kind];
      view[o + 1] = el.position.x;
      view[o + 2] = el.position.y;
      view[o + 3] = el.position.z;
      view[o + 4] = el.direction.x;
      view[o + 5] = el.direction.y;
      view[o + 6] = el.direction.z;
      view[o + 7] = el.velocity.x;
      view[o + 8] = el.velocity.y;
      view[o + 9] = el.velocity.z;
      const [p0, p1] = packParams(el);
      view[o + 10] = p0;
      view[o + 11] = p1;
    }
    this.module._set_sources(this.sourcePtr, count);
  }

  /** 追踪一批场线。seeds 为 stride 4：[x, y, z, sign] */
  trace(field: 'E' | 'B', seeds: Float64Array, opts: TraceOptions): TracedLines {
    const seedCount = Math.floor(seeds.length / 4);
    if (seedCount === 0) return { data: new Float32Array(0), lines: [] };

    const seedView = new Float64Array(this.module.HEAPF64.buffer, this.seedPtr, seeds.length);
    seedView.set(seeds);

    const resPtr = this.module._trace_lines(
      field === 'E' ? 0 : 1,
      this.seedPtr,
      seedCount,
      opts.step,
      opts.maxSteps,
      opts.maxRadius,
      opts.stopRadius,
    );

    // 调用可能触发内存增长 -> 视图必须重新获取
    const view = new Float32Array(this.module.HEAPF32.buffer, resPtr);

    const counts: number[] = [];
    let cursor = 0;
    for (let i = 0; i < seedCount; i += 1) {
      const n = view[cursor] | 0;
      counts.push(n);
      cursor += 1 + n * 4;
    }

    let pointFloats = 0;
    for (const n of counts) pointFloats += n * 4;

    const data = new Float32Array(pointFloats);
    const lines: TracedLine[] = [];
    let src = 0;
    let dst = 0;
    for (const n of counts) {
      src += 1; // 跳过每行开头的 count
      data.set(view.subarray(src, src + n * 4), dst);
      lines.push({ offset: dst, count: n });
      src += n * 4;
      dst += n * 4;
    }

    return { data, lines };
  }

  /** 单点求场（阶段 3/4 做探针、感应分析时会用） */
  evalAt(x: number, y: number, z: number): { e: Vec3; b: Vec3 } {
    this.module._eval_field(x, y, z, this.evalPtr);
    const out = new Float64Array(this.module.HEAPF64.buffer, this.evalPtr, 6);
    return {
      e: { x: out[0], y: out[1], z: out[2] },
      b: { x: out[3], y: out[4], z: out[5] },
    };
  }
}
