import { PALETTE, PARAM_SPECS, elementLabel } from '../scene/catalog';
import { nextId, type SceneStore } from '../scene/store';
import { vec3, type SceneElement } from '../scene/types';

const formatValue = (value: number): string =>
  value !== 0 && Math.abs(value) < 1e-3 ? value.toExponential(1) : value.toFixed(2);

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
      // 用黄金角在原点周围铺开，避免新要素互相重叠
      const n = store.snapshot.elements.length;
      const angle = n * 2.399963229728653;
      const radius = 1.6 + Math.floor(n / 6) * 0.9;
      const element: SceneElement = {
        id: nextId(),
        kind: item.kind,
        position: vec3(radius * Math.cos(angle), 0, radius * Math.sin(angle)),
        direction: vec3(0, 0, 1),
        velocity: vec3(),
        params: { ...item.defaults },
      };
      store.addElement(element);
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
      const row = document.createElement('label');
      row.className = 'props__row';

      const name = document.createElement('span');
      name.className = 'props__name';
      name.textContent = spec.unit ? `${spec.label} (${spec.unit})` : spec.label;

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(element.params[spec.key] ?? 0);

      const out = document.createElement('span');
      out.className = 'props__value';
      out.textContent = formatValue(element.params[spec.key] ?? 0);

      input.addEventListener('input', () => {
        const value = Number(input.value);
        const current = store.snapshot.elements.find((e) => e.id === element.id)?.params ?? {};
        const params = { ...current, [spec.key]: value };
        store.updateElement(element.id, { params });
        out.textContent = formatValue(value);
        if (titleEl) titleEl.textContent = elementLabel(element.kind, params);
      });

      row.append(name, input, out);
      propsBody.appendChild(row);
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
