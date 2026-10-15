import { PALETTE, PARAM_SPECS, createElement, defaultPosition, elementColor, elementDomain, elementLabel } from '../scene/catalog';
import type { SceneStore } from '../scene/store';
import type { SceneElement } from '../scene/types';
import type { MenuHost } from './contextMenu';
import { createParamControl } from './params';

function byId<T extends HTMLElement>(root: ParentNode, id: string): T | null {
  return root.querySelector<T>(`#${id}`);
}

/**
 * 左侧折叠抽屉，两个标签页：
 *   要素 —— 要素库 + 选中要素的属性
 *   工作 —— 场景要素清单（带 E/B 徽标），左右键都能呼出菜单，底部可添加新要素
 */
export function mountPanel(store: SceneStore, host: MenuHost | null, root: ParentNode = document): void {
  const drawer = byId<HTMLElement>(root, 'sim-drawer');
  const toggle = byId<HTMLButtonElement>(root, 'drawer-toggle');
  const tabPalette = byId<HTMLButtonElement>(root, 'tab-palette');
  const tabWork = byId<HTMLButtonElement>(root, 'tab-work');
  const panePalette = byId<HTMLElement>(root, 'pane-palette');
  const paneWork = byId<HTMLElement>(root, 'pane-work');
  const paletteBox = byId<HTMLElement>(root, 'palette');
  const propsSection = byId<HTMLElement>(root, 'props');
  const propsBody = byId<HTMLElement>(root, 'props-body');
  const workList = byId<HTMLElement>(root, 'work-list');
  const workAdd = byId<HTMLButtonElement>(root, 'work-add');
  if (!drawer || !toggle || !paletteBox || !propsSection || !propsBody) return;

  toggle.addEventListener('click', () => {
    const open = drawer.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  // ---------- 标签页 ----------
  const selectTab = (tab: 'palette' | 'work'): void => {
    tabPalette?.classList.toggle('is-active', tab === 'palette');
    tabWork?.classList.toggle('is-active', tab === 'work');
    if (panePalette) panePalette.hidden = tab !== 'palette';
    if (paneWork) paneWork.hidden = tab !== 'work';
  };
  tabPalette?.addEventListener('click', () => selectTab('palette'));
  tabWork?.addEventListener('click', () => selectTab('work'));

  // ---------- 要素库 ----------
  for (const item of PALETTE) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette__item';
    btn.textContent = `＋ ${item.label}`;
    btn.addEventListener('click', () => {
      const n = store.snapshot.elements.length;
      store.addElement(createElement(item, defaultPosition(n)));
    });
    paletteBox.appendChild(btn);
  }

  // ---------- 属性面板 ----------
  let renderedId: string | null = null;
  let titleEl: HTMLElement | null = null;

  const renderProps = (element: SceneElement): void => {
    propsBody.replaceChildren();
    titleEl = null;

    const head = document.createElement('div');
    head.className = 'props__head';

    const title = document.createElement('span');
    title.className = 'props__title';
    title.textContent = elementLabel(element.kind, element.params);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'props__delete';
    del.textContent = '删除';
    del.addEventListener('click', () => store.removeElement(element.id));

    head.append(title, del);
    propsBody.appendChild(head);
    titleEl = title;

    for (const spec of PARAM_SPECS[element.kind] ?? []) {
      propsBody.appendChild(
        createParamControl(store, element, spec, (params) => {
          if (titleEl) titleEl.textContent = elementLabel(element.kind, params);
        }),
      );
    }
  };

  // ---------- 工作栏 ----------
  const colorHex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

  const renderWork = (elements: readonly SceneElement[], selectedId: string | null): void => {
    if (!workList) return;
    if (elements.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'workrow--empty';
      empty.textContent = '（还没有要素）';
      workList.replaceChildren(empty);
      return;
    }

    workList.replaceChildren(
      ...elements.map((element) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'workrow';
        row.classList.toggle('is-selected', element.id === selectedId);

        const domain = elementDomain(element.kind);
        const badge = document.createElement('span');
        badge.className = `workrow__badge workrow__badge--${domain.toLowerCase()}`;
        badge.textContent = domain;

        const dot = document.createElement('span');
        dot.className = 'workrow__dot';
        dot.style.background = colorHex(elementColor(element.kind, element.params));

        const label = document.createElement('span');
        label.className = 'workrow__label';
        label.textContent = elementLabel(element.kind, element.params);

        row.append(badge, dot, label);

        const openMenu = (event: MouseEvent): void => {
          event.preventDefault();
          event.stopPropagation();
          store.select(element.id);
          const rect = row.getBoundingClientRect();
          host?.openForTarget(rect.left + 12, rect.bottom + 4, { id: element.id });
        };
        row.addEventListener('click', openMenu);
        row.addEventListener('contextmenu', openMenu);

        return row;
      }),
    );
  };

  workAdd?.addEventListener('click', (event) => {
    event.preventDefault();
    const rect = workAdd.getBoundingClientRect();
    host?.openPalette(rect.left, rect.bottom + 4, null);
  });

  store.subscribe((state) => {
    renderWork(state.elements, state.selectedId);

    const element = state.elements.find((e) => e.id === state.selectedId) ?? null;
    propsSection.hidden = element === null;
    if (!element) {
      propsBody.replaceChildren();
      renderedId = null;
      return;
    }
    if (element.id !== renderedId) {
      renderedId = element.id;
      renderProps(element);
    }
  });
}
