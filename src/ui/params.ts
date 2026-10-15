import { renderTex } from '../math';
import type { ParamSpec } from '../scene/catalog';
import type { SceneStore } from '../scene/store';
import type { SceneElement } from '../scene/types';

/** 把数值写成 LaTeX：小量用科学计数法，例如 1.00×10⁻⁹ C */
export function texValue(value: number, unit?: string): string {
  const suffix = unit ? `\\ \\text{${unit}}` : '';
  if (value === 0) return `0${suffix}`;

  const abs = Math.abs(value);
  if (abs >= 1e-3 && abs < 1e4) return `${value.toFixed(2)}${suffix}`;

  const exponent = Math.floor(Math.log10(abs));
  const mantissa = value / 10 ** exponent;
  return `${mantissa.toFixed(2)}\\times 10^{${exponent}}${suffix}`;
}

/**
 * 某个参数的滑块 + LaTeX 读数。
 * 属性面板与右键菜单共用同一份实现，onChange 拿到更新后的完整参数（便于联动标题等）。
 */
export function createParamControl(
  store: SceneStore,
  element: SceneElement,
  spec: ParamSpec,
  onChange?: (params: Record<string, number>) => void,
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'param';

  const name = document.createElement('span');
  name.className = 'param__name';
  name.textContent = spec.label;

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'param__input';
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step);
  input.value = String(element.params[spec.key] ?? 0);

  const value = document.createElement('span');
  value.className = 'param__value';
  renderTex(value, texValue(element.params[spec.key] ?? 0, spec.unit));

  input.addEventListener('input', () => {
    const next = Number(input.value);
    const current = store.snapshot.elements.find((e) => e.id === element.id)?.params ?? {};
    const params = { ...current, [spec.key]: next };
    store.updateElement(element.id, { params });
    renderTex(value, texValue(next, spec.unit));
    onChange?.(params);
  });

  row.append(name, input, value);
  return row;
}
