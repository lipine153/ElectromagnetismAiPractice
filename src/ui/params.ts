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
  // toggle 用「名称 值 按钮」一行排开，range 仍保持竖排
  row.className = spec.type === 'toggle' ? 'param param--toggle' : 'param';

  const name = document.createElement('span');
  name.className = 'param__name';
  name.textContent = spec.label;

  const read = (params: Record<string, number>): number => params[spec.key] ?? 0;

  const commit = (raw: number): void => {
    const current = store.snapshot.elements.find((e) => e.id === element.id)?.params ?? {};
    const params = { ...current, [spec.key]: raw };
    store.updateElement(element.id, { params });
    onChange?.(params);
  };

  const value = document.createElement('span');
  value.className = 'param__value';

  let input: HTMLInputElement;

  if (spec.type === 'toggle') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'param__input param__input--toggle';
    input.checked = read(element.params) > 0.5;
    value.textContent = input.checked ? '开' : '关';
    input.addEventListener('change', () => {
      const next = input.checked ? 1 : 0;
      commit(next);
      value.textContent = next ? '开' : '关';
    });
    // 一行：名称 · 值 · 开关按钮
    row.append(name, value, input);
    return row;
  } else {
    input = document.createElement('input');
    input.type = 'range';
    input.className = 'param__input';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(read(element.params));
    renderTex(value, texValue(read(element.params), spec.unit));
    input.addEventListener('input', () => {
      const next = Number(input.value);
      commit(next);
      renderTex(value, texValue(next, spec.unit));
    });
  }

  row.append(name, input, value);
  return row;
}
