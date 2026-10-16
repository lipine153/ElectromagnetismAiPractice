/**
 * public/bin/field_line.js（Emscripten 产物）暴露的全局工厂。
 * 该文件以经典 <script> 载入，不属于模块，故在此做全局声明。
 */
interface FieldLineModuleArg {
  /** 直接提供 wasm 二进制，可跳过对 .wasm 的 fetch（离线单文件构建用） */
  wasmBinary?: Uint8Array | ArrayBuffer;
}

interface FieldLineModuleInstance {
  readonly HEAPF32: Float32Array;
  readonly HEAPF64: Float64Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  /** 上传场源列表：每个源 12 个 double（见 cpp/include/source.hpp） */
  _set_sources(dataPtr: number, count: number): void;
  /** 批量追踪场线，返回内部缓冲指针；每个种子 4 个 double：[x, y, z, sign] */
  _trace_lines(
    field: number,
    seedsPtr: number,
    seedCount: number,
    step: number,
    maxSteps: number,
    maxRadius: number,
    stopRadius: number,
  ): number;
  /** 单点求场，out = [Ex, Ey, Ez, Bx, By, Bz] */
  _eval_field(x: number, y: number, z: number, outPtr: number): void;
  /**
   * 推进自由点电荷一个帧步长（Boris push）。
   * 返回内部缓冲指针：[count, stopped, (x, y, z) x count]。
   */
  _particle_advance(
    statePtr: number,
    qOverM: number,
    dt: number,
    substeps: number,
    maxRadius: number,
    stopRadius: number,
  ): number;
  getValue(ptr: number, type: string): number;
}

declare function FieldLineModule(moduleArg?: FieldLineModuleArg): Promise<FieldLineModuleInstance>;

/** 离线单文件构建时由构建脚本注入（base64 的 wasm），有它就不再请求 .wasm */
interface Window {
  __FIELD_LINE_WASM__?: string;
}
