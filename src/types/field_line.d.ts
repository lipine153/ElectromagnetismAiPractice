/**
 * public/bin/field_line.js（Emscripten 产物）暴露的全局工厂。
 * 该文件以经典 <script> 载入，不属于模块，故在此做全局声明。
 */
interface FieldLineModuleInstance {
  readonly HEAPF32: Float32Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _traceFieldLine(
    startX: number,
    startY: number,
    startZ: number,
    stepSize: number,
    maxSteps: number,
    outPointCountPtr: number,
  ): number;
  _freeFieldLine(ptr: number): void;
  getValue(ptr: number, type: string): number;
}

declare function FieldLineModule(): Promise<FieldLineModuleInstance>;
