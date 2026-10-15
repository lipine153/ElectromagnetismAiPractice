import { PALETTE, PARAM_SPECS, createElement, defaultPosition, elementLabel } from '../scene/catalog';
import type { SceneStore } from '../scene/store';
import type { Vec3 } from '../scene/types';
import { createParamControl } from './params';

export interface ContextMenuDeps {
  /** 挂 contextmenu 监听的画布 */
  canvas: HTMLCanvasElement;
  /** 命中要素则返回其 id */
  pickAt(clientX: number, clientY: number): string | null;
  /** 射线与地面 y=0 的交点，作为新要素的落点 */
  pickGround(clientX: number, clientY: number): Vec3 | null;
}

/**
 * 右键上下文菜单：
 *   点在要素上 → 选中它并给出「删除」
 *   点在空白处 → 给出要素库，新要素落在右键所指的地面位置
 *
 * 右键拖拽平移已经让给中键（见 scene3d.ts），所以右键可以专用于菜单，
 * 只需 preventDefault 屏蔽浏览器原生菜单，不必干预 OrbitControls。
 */
export function mountContextMenu(
  store: SceneStore,
  deps: ContextMenuDeps,
  root: ParentNode = document,
): void {
  const menu = root.querySelector<HTMLElement>('#ctx-menu');
  if (!menu) return;

  let isOpen = false;

  const close = (): void => {
    if (!isOpen) return;
    isOpen = false;
    menu.hidden = true;
    menu.replaceChildren();
  };

  const makeItem = (label: string, danger: boolean, action: () => void): HTMLButtonElement => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = danger ? 'ctx__item ctx__item--danger' : 'ctx__item';
    item.textContent = label;
    item.addEventListener('click', () => {
      close();
      action();
    });
    return item;
  };

  deps.canvas.addEventListener('contextmenu', (event: MouseEvent) => {
    event.preventDefault();

    const title = document.createElement('div');
    title.className = 'ctx__title';
    const items: HTMLElement[] = [];

    const hitId = deps.pickAt(event.clientX, event.clientY);
    const hit = hitId ? store.snapshot.elements.find((e) => e.id === hitId) : undefined;

    if (hit) {
      store.select(hit.id);
      title.textContent = elementLabel(hit.kind, hit.params);
      // 参数可以直接在菜单里改（如电荷量），与左侧属性面板是同一份控件
      for (const spec of PARAM_SPECS[hit.kind] ?? []) {
        items.push(
          createParamControl(store, hit, spec, (params) => {
            title.textContent = elementLabel(hit.kind, params);
          }),
        );
      }
      items.push(makeItem('删除', true, () => store.removeElement(hit.id)));
    } else {
      title.textContent = '添加要素';
      const ground = deps.pickGround(event.clientX, event.clientY);
      for (const paletteItem of PALETTE) {
        items.push(
          makeItem(paletteItem.label, false, () => {
            const n = store.snapshot.elements.length;
            store.addElement(createElement(paletteItem, ground ?? defaultPosition(n)));
          }),
        );
      }
    }

    if (items.length === 0) return;

    menu.replaceChildren(title, ...items);
    menu.hidden = false;
    isOpen = true;

    // 先显示再量尺寸，避免菜单超出窗口
    const rect = menu.getBoundingClientRect();
    const left = Math.min(event.clientX, window.innerWidth - rect.width - 8);
    const top = Math.min(event.clientY, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  });

  // 关闭时机：点别处 / 滚轮缩放 / 窗口失焦 / Esc
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (isOpen && !menu.contains(event.target as Node)) close();
    },
    true,
  );
  window.addEventListener('wheel', close, { passive: true });
  window.addEventListener('blur', close);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}
