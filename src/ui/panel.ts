import { PALETTE, PARAM_SPECS, createElement, defaultPosition, elementLabel } from '../scene/catalog';
import type { SceneStore } from '../scene/store';
import type { SceneElement } from '../scene/types';
import { createParamControl } from './params';

/** 左侧折叠抽屉：要素库 + 选中要素的属性 */
export function mountPanel(store: SceneStore, root: ParentNode = document): void {
  const drawer = root.querySelector<HTMLElement>('#sim-drawer');
  const toggle = root.querySelector<HTMLButtonElement>('#drawer-toggle');
  const paletteBox = root.querySelector<HTMLElement>('#palette');
  const propsSection = root.querySelector<HTMLElement>('#props');
  const propsBody = root.querySelector<HTMLElement>('#props-body');
  if (!drawer || !toggle || !paletteBox || !propsSection || !propsBody) return;

  toggle.addEventListener('click', () => {
    const open = drawer.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  // ---- 要素库 ----
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

  // ---- 属性面板：只在选中要素时出现；换选中才重建 DOM，避免拖拽时反复重建 ----
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

  store.subscribe((state) => {
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
