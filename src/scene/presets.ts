import { PALETTE, createElement, type PaletteItem } from './catalog';
import { vec3, type FieldMode, type SceneElement } from './types';

/**
 * 沙盒 ↔ 闯关 的**深链**契约：`index.html#p=<预设 id>&<参数>=<数值>`。
 *
 * 预设的**定义只在这里**（沙盒这一侧）。闯关那边只负责把「预设 id + 该关的数值」拼进
 * 地址（`game/levels.ts` 的 `sandboxHref`），两边不共享场景构造代码，只共享这个 id。
 * 参数会覆盖预设的默认值，所以同一关换个数值也能直接用。
 */
export interface SandboxPreset {
  /** 对应的闯关关卡（1-based）：沙盒顶栏的「闯关」按钮据此跳回那一关 */
  readonly level: number;
  /** 载入后默认显示哪个场 */
  readonly fieldMode: FieldMode;
  /** 给用户看的一句话说明，会拼进底部提示 */
  readonly label: string;
  build(params: Record<string, number>): SceneElement[];
}

function paletteItem(id: string): PaletteItem {
  const item = PALETTE.find((entry) => entry.id === id);
  if (!item) throw new Error(`要素库缺少 ${id}`);
  return item;
}

export const PRESETS: Readonly<Record<string, SandboxPreset>> = {
  /** 第5关 长直导线磁场 B：开放两节点导线，两端自动延伸到无穷远 */
  'long-wire': {
    level: 5,
    fieldMode: 'B',
    label: '无限长直导线',
    build: (params) => {
      const wire = createElement(paletteItem('wire'), vec3(0, 0, 0));
      wire.params.i = params.i ?? 10;
      // 竖直放置：磁力线在水平面内成同心圆，最接近课本插图
      wire.nodes = [vec3(0, -1, 0), vec3(0, 1, 0)];
      return [wire];
    },
  },

  /** 第6关 螺线管匀强磁场 */
  solenoid: {
    level: 6,
    fieldMode: 'B',
    label: '螺线管',
    build: (params) => {
      const solenoid = createElement(paletteItem('solenoid'), vec3(0, 0, 0));
      solenoid.params.i = params.i ?? 2;
      solenoid.params.n = params.n ?? 500;
      if (params.radius !== undefined) solenoid.params.radius = params.radius;
      if (params.length !== undefined) solenoid.params.length = params.length;
      return [solenoid];
    },
  },

  /** 第7关 线圈：沙盒里对应单匝通电圆环 */
  'current-loop': {
    level: 7,
    fieldMode: 'B',
    label: '通电圆环',
    build: (params) => {
      const loop = createElement(paletteItem('wire'), vec3(0, 0, 0));
      loop.params.closed = 1;
      loop.params.i = params.i ?? 0.4;
      return [loop];
    },
  },
};

/** 解析 `#p=<id>&k=v...`；没有可用预设时返回 null（那就走默认示例场景） */
export function readPresetFromHash(
  hash: string,
): { preset: SandboxPreset; params: Record<string, number> } | null {
  const query = new URLSearchParams(hash.replace(/^#/, ''));
  const preset = PRESETS[query.get('p') ?? ''];
  if (!preset) return null;

  const params: Record<string, number> = {};
  query.forEach((value, key) => {
    if (key === 'p') return;
    const num = Number(value);
    if (Number.isFinite(num)) params[key] = num;
  });
  return { preset, params };
}
