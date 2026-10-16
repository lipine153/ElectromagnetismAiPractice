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

/** 一个参数控件：root 挂到面板/菜单上，refresh 用于「别的控件改了同一批参数」后同步显示 */
export interface ParamControl {
  root: HTMLElement;
  refresh(params: Record<string, number>): void;
}

/** log 档位 <-> 真实值 */
const logAt = (spec: ParamSpec, t: number): number => {
  const lo = Math.log10(spec.min);
  const hi = Math.log10(spec.max);
  return 10 ** (lo + (hi - lo) * (t / (spec.steps ?? 100)));
};
const logIndexOf = (spec: ParamSpec, value: number): number => {
  const lo = Math.log10(spec.min);
  const hi = Math.log10(spec.max);
  const t = ((Math.log10(Math.max(value, 1e-300)) - lo) / (hi - lo)) * (spec.steps ?? 100);
  return Math.max(0, Math.min(spec.steps ?? 100, Math.round(t)));
};

/**
 * 某个参数的滑块 + LaTeX 读数。
 * 属性面板与右键菜单共用同一份实现，onChange 拿到更新后的完整参数（便于联动标题等）。
 */
export function createParamControl(
  store: SceneStore,
  element: SceneElement,
  spec: ParamSpec,
  onChange?: (params: Record<string, number>) => void,
): ParamControl {
  const row = document.createElement('label');
  // toggle / 单行控件用「名称 值 按钮」一行排开，range 仍保持竖排
  row.className =
    spec.type === 'toggle' || spec.type === 'choice' ? 'param param--toggle' : 'param';

  const name = document.createElement('span');
  name.className = 'param__name';
  name.textContent = spec.label;

  const live = (): Record<string, number> =>
    store.snapshot.elements.find((e) => e.id === element.id)?.params ?? {};

  /** 写一批参数（choice 会一次写多个键） */
  const commitValues = (values: Record<string, number>): void => {
    const params = { ...live(), ...values };
    store.updateElement(element.id, { params });
    onChange?.(params);
  };
  const commit = (raw: number): void => commitValues({ [spec.key]: raw });

  const value = document.createElement('span');
  value.className = 'param__value';

  // ---- 一排按钮：每个按钮写入一组参数 ----
  if (spec.type === 'choice') {
    const buttons = (spec.choices ?? []).map((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'param__choice';
      button.textContent = choice.label;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        commitValues(choice.values);
      });
      return { button, choice };
    });

    /** 当前值命中哪个按钮就高亮哪个（「预设」与「电性」互相联动时靠它同步） */
    const paint = (params: Record<string, number>): void => {
      for (const { button, choice } of buttons) {
        const hit = Object.entries(choice.values).every(
          ([key, want]) =>
            Math.abs((params[key] ?? 0) - want) <=
            Math.max(1e-30, Math.abs(want) * 1e-6),
        );
        button.classList.toggle('is-active', hit);
      }
    };
    paint(element.params);
    const box = document.createElement('span');
    box.className = 'param__choices';
    box.append(...buttons.map((b) => b.button));
    row.append(name, box);
    return { root: row, refresh: paint };
  }

  let input: HTMLInputElement;

  if (spec.type === 'toggle') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'param__input param__input--toggle';
    input.checked = (element.params[spec.key] ?? 0) > 0.5;
    value.textContent = input.checked ? '开' : '关';
    input.addEventListener('change', () => {
      const next = input.checked ? 1 : 0;
      commit(next);
      value.textContent = next ? '开' : '关';
    });
    // 一行：名称 · 值 · 开关按钮
    row.append(name, value, input);
    return {
      root: row,
      refresh: (params) => {
        const on = (params[spec.key] ?? 0) > 0.5;
        input.checked = on;
        value.textContent = on ? '开' : '关';
      },
    };
  }

  // ---- 滑块（线性 / 对数）----
  const isLog = spec.type === 'log';
  input = document.createElement('input');
  input.type = 'range';
  input.className = 'param__input';
  input.min = String(isLog ? 0 : spec.min);
  input.max = String(isLog ? (spec.steps ?? 100) : spec.max);
  input.step = String(isLog ? 1 : spec.step);

  const paint = (raw: number): void => {
    input.value = String(isLog ? logIndexOf(spec, raw) : raw);
    renderTex(value, texValue(raw, spec.unit));
  };
  paint(element.params[spec.key] ?? 0);

  input.addEventListener('input', () => {
    const t = Number(input.value);
    const next = isLog ? logAt(spec, t) : t;
    renderTex(value, texValue(next, spec.unit));
    commit(next);
  });

  row.append(name, input, value);
  return { root: row, refresh: (params) => paint(params[spec.key] ?? 0) };
}

/** 把一批控件串起来：任何一个改动了参数，其余控件跟着刷新（预设 → q/m 滑块联动） */
export function linkParamControls(controls: ParamControl[]): (params: Record<string, number>) => void {
  return (params) => {
    for (const control of controls) control.refresh(params);
  };
}
