import type { ElementKind, SceneElement, Vec3 } from './types';

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** 默认 range；`toggle` 渲染成开关（值 0/1） */
  type?: 'range' | 'toggle';
}

export interface PaletteItem {
  id: string;
  label: string;
  kind: ElementKind;
  defaults: Record<string, number>;
}

/** 左侧抽屉「要素」标签页里的要素库。后续按阶段追加。 */
export const PALETTE: PaletteItem[] = [
  { id: 'charge+', label: '正电荷', kind: 'charge', defaults: { q: 1e-9 } },
  { id: 'charge-', label: '负电荷', kind: 'charge', defaults: { q: -1e-9 } },
  { id: 'wire', label: '通电导线', kind: 'straightWire', defaults: { i: 1, closed: 0 } },
  { id: 'solenoid', label: '螺线管', kind: 'solenoid', defaults: { i: 1, n: 500, radius: 0.5, length: 2 } },
  { id: 'dipole', label: '磁偶极子', kind: 'dipole', defaults: { m: 1 } },
];

/** 各 kind 可调参数（属性面板 / 右键菜单 / 工作栏共用） */
export const PARAM_SPECS: Partial<Record<ElementKind, ParamSpec[]>> = {
  charge: [{ key: 'q', label: '电荷量', min: -5e-9, max: 5e-9, step: 1e-10, unit: 'C' }],
  straightWire: [
    { key: 'i', label: '电流', min: -10, max: 10, step: 0.5, unit: 'A' },
    { key: 'closed', label: '闭合', min: 0, max: 1, step: 1, type: 'toggle' },
  ],
  solenoid: [
    { key: 'i', label: '电流', min: -10, max: 10, step: 0.5, unit: 'A' },
    { key: 'n', label: '匝密度', min: 50, max: 2000, step: 50, unit: '匝/m' },
    { key: 'radius', label: '半径', min: 0.1, max: 2, step: 0.05, unit: 'm' },
    { key: 'length', label: '长度', min: 0.3, max: 4, step: 0.1, unit: 'm' },
  ],
  dipole: [{ key: 'm', label: '磁矩', min: -5, max: 5, step: 0.1, unit: 'A·m²' }],
};

/** 模型配色 */
export function elementColor(kind: ElementKind, params: Record<string, number>): number {
  if (kind === 'charge') return (params.q ?? 0) >= 0 ? 0xf87171 : 0x60a5fa;
  if (kind === 'straightWire') return 0xcbd5e1;
  if (kind === 'solenoid') return 0x93c5fd;
  if (kind === 'dipole') return 0xa78bfa;
  return 0x9aa7bd;
}

/** 工作栏里用的 E / B 徽标：电学要素标 E，磁学要素标 B */
export function elementDomain(kind: ElementKind): 'E' | 'B' {
  return kind === 'charge' ? 'E' : 'B';
}

export function elementLabel(kind: ElementKind, params: Record<string, number>): string {
  if (kind === 'charge') return (params.q ?? 0) >= 0 ? '正电荷' : '负电荷';
  if (kind === 'straightWire') return (params.closed ?? 0) > 0.5 ? '通电导线（闭合）' : '通电导线';
  if (kind === 'solenoid') return '螺线管';
  if (kind === 'dipole') return '磁偶极子';
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
  const element: SceneElement = {
    id: nextId(),
    kind: item.kind,
    position,
    direction: { x: 0, y: 0, z: 1 },
    velocity: { x: 0, y: 0, z: 0 },
    params: { ...item.defaults },
  };

  if (item.kind === 'straightWire') {
    // 默认是一条**开放**直导线（两个节点）：配合「两端延伸到无穷远」= 无限长直导线
    const r = 1;
    element.nodes = [
      { x: position.x - r, y: position.y, z: position.z },
      { x: position.x + r, y: position.y, z: position.z },
    ];
    element.direction = { x: 0, y: 1, z: 0 };
  } else if (item.kind === 'solenoid' || item.kind === 'dipole') {
    // 轴/磁矩默认竖直
    element.direction = { x: 0, y: 1, z: 0 };
  }

  return element;
}
