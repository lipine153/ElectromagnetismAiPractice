import { PALETTE, createElement, defaultPosition } from '../scene/catalog';
import type { SceneStore } from '../scene/store';
import type { Vec3 } from '../scene/types';
import { buildMenuContent, type MenuTarget } from './elementMenu';

export interface MenuHost {
  /** 打开某个要素/节点的菜单 */
  openForTarget(clientX: number, clientY: number, target: MenuTarget): void;
  /** 打开「添加要素」菜单 */
  openPalette(clientX: number, clientY: number, ground: Vec3 | null): void;
  close(): void;
}

/**
 * 菜单宿主：3D 视口右键与工作栏都共用同一个 `#ctx-menu`，保证菜单内容/行为完全一致。
 */
export function createMenuHost(store: SceneStore, root: ParentNode = document): MenuHost | null {
  const menu = root.querySelector<HTMLElement>('#ctx-menu');
  if (!menu) return null;

  let isOpen = false;

  const close = (): void => {
    if (!isOpen) return;
    isOpen = false;
    menu.hidden = true;
    menu.replaceChildren();
  };

  const show = (clientX: number, clientY: number, title: string, items: HTMLElement[]): void => {
    if (items.length === 0) return;
    const titleEl = document.createElement('div');
    titleEl.className = 'ctx__title';
    titleEl.textContent = title;

    menu.replaceChildren(titleEl, ...items);
    menu.hidden = false;
    isOpen = true;

    // 先显示再量尺寸，避免菜单超出窗口
    const rect = menu.getBoundingClientRect();
    const left = Math.min(clientX, window.innerWidth - rect.width - 8);
    const top = Math.min(clientY, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  };

  const openPalette = (clientX: number, clientY: number, ground: Vec3 | null): void => {
    const items = PALETTE.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ctx__item';
      button.textContent = item.label;
      button.addEventListener('click', () => {
        close();
        const n = store.snapshot.elements.length;
        store.addElement(createElement(item, ground ?? defaultPosition(n)));
      });
      return button;
    });
    show(clientX, clientY, '添加要素', items);
  };

  const openForTarget = (clientX: number, clientY: number, target: MenuTarget): void => {
    store.select(target.id);
    const content = buildMenuContent(store, target, close);
    if (!content) return;
    show(clientX, clientY, content.title, content.items);
  };

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

  return { openForTarget, openPalette, close };
}

export interface ContextMenuDeps {
  /** 挂 contextmenu 监听的画布 */
  canvas: HTMLCanvasElement;
  /** 命中要素/节点则返回其信息 */
  pickAt(clientX: number, clientY: number): { id: string; node: number | null; point: Vec3 } | null;
  /** 射线与地面 y=0 的交点，作为新要素的落点 */
  pickGround(clientX: number, clientY: number): Vec3 | null;
  /** 把「选中的节点」同步给视图层（决定 gizmo 挂在哪） */
  selectNode(index: number | null): void;
}

/**
 * 3D 视口的右键上下文菜单：空白处 → 要素库；要素上 → 参数/增删节点/删除。
 * 右键拖拽平移已让给中键（见 scene3d.ts），所以右键可以专用于菜单。
 */
export function mountContextMenu(store: SceneStore, deps: ContextMenuDeps, host: MenuHost): void {
  deps.canvas.addEventListener('contextmenu', (event: MouseEvent) => {
    event.preventDefault();

    const hit = deps.pickAt(event.clientX, event.clientY);
    if (!hit) {
      deps.selectNode(null);
      host.openPalette(event.clientX, event.clientY, deps.pickGround(event.clientX, event.clientY));
      return;
    }

    deps.selectNode(hit.node);
    host.openForTarget(event.clientX, event.clientY, { ...hit, point: hit.point });
  });

  void store;
}
