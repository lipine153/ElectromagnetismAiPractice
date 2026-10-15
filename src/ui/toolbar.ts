import type { SceneStore } from '../scene/store';
import type { FieldMode } from '../scene/types';

/** 顶栏：E / B / 同时 三态切换 + 重置场景 */
export function mountToolbar(store: SceneStore, root: ParentNode = document): void {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-field]'));

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.field as FieldMode | undefined;
      if (mode) store.setFieldMode(mode);
    });
  }

  // ---------- 方向箭头 ----------
  const arrowBtn = root.querySelector<HTMLButtonElement>('#toggle-arrows');
  arrowBtn?.addEventListener('click', () => {
    store.setShowArrows(!store.snapshot.showArrows);
  });

  const legend = root.querySelector<HTMLElement>('#sim-legend');
  const eLegend = root.querySelector<HTMLElement>('#legend-e');
  const bLegend = root.querySelector<HTMLElement>('#legend-b');

  store.subscribe((state) => {
    for (const btn of buttons) {
      btn.classList.toggle('is-active', btn.dataset.field === state.fieldMode);
    }
    if (arrowBtn) {
      arrowBtn.classList.toggle('is-on', state.showArrows);
      arrowBtn.setAttribute('aria-pressed', String(state.showArrows));
    }
    const showE = state.fieldMode !== 'B';
    const showB = state.fieldMode !== 'E';
    if (legend) legend.hidden = !showE && !showB;
    if (eLegend) eLegend.hidden = !showE;
    if (bLegend) bLegend.hidden = !showB;
  });

  root.querySelector<HTMLButtonElement>('#sim-reset')?.addEventListener('click', () => {
    store.clear();
  });
}
