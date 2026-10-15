import type { ElementKind, SceneElement, Vec3 } from './types';

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export interface PaletteItem {
  id: string;
  label: string;
  kind: ElementKind;
  defaults: Record<string, number>;
}

/** 左侧抽屉里的「要素库」。阶段 0 只有点电荷，后续按阶段追加。 */
export const PALETTE: PaletteItem[] = [
  { id: 'charge+', label: '正电荷', kind: 'charge', defaults: { q: 1e-9 } },
  { id: 'charge-', label: '负电荷', kind: 'charge', defaults: { q: -1e-9 } },
];

/** 各 kind 可调参数的滑块定义（属性面板用） */
export const PARAM_SPECS: Partial<Record<ElementKind, ParamSpec[]>> = {
  charge: [{ key: 'q', label: '电荷量', min: -5e-9, max: 5e-9, step: 1e-10, unit: 'C' }],
};

/** 正负电荷的模型配色 */
export function elementColor(kind: ElementKind, params: Record<string, number>): number {
  if (kind === 'charge') return (params.q ?? 0) >= 0 ? 0xf87171 : 0x60a5fa;
  return 0x9aa7bd;
}

export function elementLabel(kind: ElementKind, params: Record<string, number>): string {
  if (kind === 'charge') return (params.q ?? 0) >= 0 ? '正电荷' : '负电荷';
  return kind;
}

let seq = 0;

/** 生成要素 id */
export function nextId(): string {
  seq += 1;
  return `el-${seq}`;
}

/** 没有指定落点时的默认位置：黄金角在原点周围铺开，避免互相重叠 */
export function defaultPosition(index: number): Vec3 {
  const angle = index * 2.399963229728653;
  const radius = 1.6 + Math.floor(index / 6) * 0.9;
  return { x: radius * Math.cos(angle), y: 0, z: radius * Math.sin(angle) };
}

/** 由要素库条目创建要素 */
export function createElement(item: PaletteItem, position: Vec3): SceneElement {
  return {
    id: nextId(),
    kind: item.kind,
    position,
    direction: { x: 0, y: 0, z: 1 },
    velocity: { x: 0, y: 0, z: 0 },
    params: { ...item.defaults },
  };
}
