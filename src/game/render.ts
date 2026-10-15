import { renderModelSvg } from '../models';
import { renderMath, renderTex } from '../math';
import type { Level } from './levels';
import type { GameState } from './state';

export interface HudRefs {
  level: HTMLElement;
  total: HTMLElement;
  score: HTMLElement;
  timer: HTMLElement;
}

export function paintHud(refs: HudRefs, state: Readonly<GameState>, totalLevels: number): void {
  refs.level.textContent = String(state.level);
  refs.total.textContent = String(totalLevels);
  refs.score.textContent = String(state.score);
  refs.timer.textContent = String(Math.max(0, state.timeLeft));
}

/** 生成关卡选择按钮 */
export function renderLevelChips(
  container: HTMLElement,
  total: number,
  onPick: (level: number) => void,
): HTMLButtonElement[] {
  container.replaceChildren();
  const buttons: HTMLButtonElement[] = [];
  for (let n = 1; n <= total; n++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = `第${n}关`;
    btn.addEventListener('click', () => onPick(n));
    container.appendChild(btn);
    buttons.push(btn);
  }
  return buttons;
}

export function paintLevelChips(buttons: HTMLButtonElement[], current: number): void {
  buttons.forEach((btn, i) => btn.classList.toggle('is-current', i + 1 === current));
}

export function renderQuestion(el: HTMLElement, level: Level): void {
  // 用 textContent 写入再交给 KaTeX：`<`、`>` 原样保留，不会被当成 HTML 标签
  el.textContent = level.question;
  renderMath(el);
}

export function renderModel(el: HTMLElement, level: Level): void {
  el.innerHTML = renderModelSvg(level.model);
  // 图上标注是纯 LaTeX（无 \(..\) 包裹），逐个直接渲染
  el.querySelectorAll<HTMLElement>('.model__tex').forEach((node) => {
    renderTex(node, node.textContent ?? '');
  });
}

export function renderOptions(
  container: HTMLElement,
  options: readonly string[],
  onSelect: (value: string) => void,
): HTMLButtonElement[] {
  container.replaceChildren();
  return options.map((value) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.value = value;
    btn.textContent = value;
    btn.addEventListener('click', () => onSelect(value));
    container.appendChild(btn);
    return btn;
  });
}

export interface SlotRefs {
  root: HTMLButtonElement;
  label: HTMLElement;
  value: HTMLElement;
}

export function renderSlots(
  container: HTMLElement,
  names: readonly string[],
  onSlot: (index: number) => void,
): SlotRefs[] {
  container.replaceChildren();
  return names.map((name, index) => {
    const root = document.createElement('button');
    root.type = 'button';
    root.className = 'slot';
    root.dataset.index = String(index);

    const label = document.createElement('span');
    label.className = 'slot__label';
    label.textContent = name;

    const value = document.createElement('span');
    value.className = 'slot__value';

    root.append(label, value);
    container.appendChild(root);
    renderMath(label); // 槽位标题是 LaTeX
    root.addEventListener('click', () => onSlot(index));
    return { root, label, value };
  });
}

export function paintSlots(slots: SlotRefs[], placed: readonly (string | null)[]): void {
  slots.forEach((slot, i) => {
    const value = placed[i] ?? null;
    slot.value.textContent = value ?? '';
    slot.root.classList.toggle('is-filled', value !== null);
    slot.root.classList.remove('is-correct', 'is-wrong');
  });
}
