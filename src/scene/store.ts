import type { FieldMode, SceneElement } from './types';

export interface SceneState {
  elements: SceneElement[];
  selectedId: string | null;
  fieldMode: FieldMode;
  /** 是否显示场线方向箭头 */
  showArrows: boolean;
  /** 是否正在拖拽某个要素 */
  dragging: boolean;
}

type Listener = (state: Readonly<SceneState>) => void;

let seq = 0;
export function nextId(): string {
  seq += 1;
  return `el-${seq}`;
}

/** 场景的单一状态源：要素列表 / 选中项 / 显示模式 */
export class SceneStore {
  private state: SceneState = {
    elements: [],
    selectedId: null,
    fieldMode: 'E',
    showArrows: true,
    dragging: false,
  };
  private listeners = new Set<Listener>();

  get snapshot(): Readonly<SceneState> {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private patch(next: Partial<SceneState>): void {
    this.state = { ...this.state, ...next };
    for (const fn of this.listeners) fn(this.state);
  }

  addElement(element: SceneElement): void {
    this.patch({ elements: [...this.state.elements, element], selectedId: element.id });
  }

  removeElement(id: string): void {
    this.patch({
      elements: this.state.elements.filter((e) => e.id !== id),
      selectedId: this.state.selectedId === id ? null : this.state.selectedId,
    });
  }

  updateElement(id: string, patch: Partial<SceneElement>): void {
    this.patch({
      elements: this.state.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  }

  clear(): void {
    this.patch({ elements: [], selectedId: null });
  }

  select(id: string | null): void {
    this.patch({ selectedId: id });
  }

  setFieldMode(mode: FieldMode): void {
    this.patch({ fieldMode: mode });
  }

  setShowArrows(show: boolean): void {
    this.patch({ showArrows: show });
  }

  setDragging(dragging: boolean): void {
    this.patch({ dragging });
  }
}
