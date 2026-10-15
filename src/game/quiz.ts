import { byId } from '../dom';
import { levels } from './levels';
import { GameStore } from './state';
import {
  paintHud,
  paintLevelChips,
  paintSlots,
  renderLevelChips,
  renderModel,
  renderOptions,
  renderQuestion,
  renderSlots,
  type HudRefs,
  type SlotRefs,
} from './render';

export function createQuiz(): void {
  const hud: HudRefs = {
    level: byId('hud-level'),
    total: byId('hud-total'),
    score: byId('hud-score'),
    timer: byId('hud-timer'),
  };
  const levelSelect = byId('level-select');
  const questionEl = byId('question');
  const modelEl = byId('model');
  const optionsEl = byId('options');
  const slotsEl = byId('slots');
  const resetBtn = byId<HTMLButtonElement>('btn-reset');
  const submitBtn = byId<HTMLButtonElement>('btn-submit');
  const modal = byId('modal');
  const modalIcon = byId('modal-icon');
  const modalTitle = byId('modal-title');
  const modalDesc = byId('modal-desc');
  const modalClose = byId<HTMLButtonElement>('modal-close');
  const modalNext = byId<HTMLButtonElement>('modal-next');

  const store = new GameStore();
  let selected: string | null = null;
  let placed: (string | null)[] = [];
  let optionButtons: HTMLButtonElement[] = [];
  let slots: SlotRefs[] = [];

  store.subscribe((state) => paintHud(hud, state, store.totalLevels));
  store.onTimeout = () => showModal(false, '时间耗尽', '计算超时，闯关失败，请重新计算作答');

  const levelChips = renderLevelChips(levelSelect, store.totalLevels, loadLevel);

  function paintOptionSelection(): void {
    for (const btn of optionButtons) {
      btn.classList.toggle('is-selected', btn.dataset.value === selected);
    }
  }

  function loadLevel(n: number): void {
    const level = levels[n - 1];
    if (!level) return;

    selected = null;
    placed = level.areaNames.map(() => null);
    store.goToLevel(n);

    renderQuestion(questionEl, level);
    renderModel(modelEl, level);

    optionButtons = renderOptions(optionsEl, level.options, (value) => {
      selected = selected === value ? null : value;
      paintOptionSelection();
    });

    slots = renderSlots(slotsEl, level.areaNames, (index) => {
      if (placed[index] !== null) {
        placed[index] = null; // 再点一次清空
      } else if (selected !== null) {
        placed[index] = selected;
      }
      paintSlots(slots, placed);
    });

    paintLevelChips(levelChips, n);
    paintOptionSelection();
    paintSlots(slots, placed);
  }

  function showModal(pass: boolean, title: string, desc: string): void {
    modalIcon.className = `modal__icon ${pass ? 'is-pass' : 'is-fail'}`;
    modalIcon.textContent = pass ? '✓' : '✕';
    modalTitle.textContent = pass ? '计算正确！' : title;
    modalDesc.textContent = desc;
    modalNext.hidden = !pass || store.snapshot.level >= store.totalLevels;
    modal.classList.add('is-open');
  }

  function closeModal(): void {
    modal.classList.remove('is-open');
  }

  resetBtn.addEventListener('click', () => loadLevel(store.snapshot.level));

  modalClose.addEventListener('click', closeModal);

  modalNext.addEventListener('click', () => {
    closeModal();
    loadLevel(store.snapshot.level + 1);
  });

  submitBtn.addEventListener('click', () => {
    const level = levels[store.snapshot.level - 1];
    if (!level) return;

    let allOk = true;
    slots.forEach((slot, i) => {
      const ok = placed[i] !== null && placed[i] === level.answer[i];
      slot.root.classList.toggle('is-correct', ok);
      slot.root.classList.toggle('is-wrong', !ok);
      if (!ok) allOk = false;
    });

    if (!allOk) {
      showModal(false, '结果错误', '部分数值有误，请核对公式与计算过程后重试');
      return;
    }

    store.stopTimer();
    store.addScore(100);

    if (store.snapshot.level >= store.totalLevels) {
      showModal(true, '计算正确！', `恭喜完成全部 ${store.totalLevels} 道电磁计算题，总分：${store.snapshot.score}`);
      modalNext.hidden = true;
    } else {
      showModal(true, '计算正确！', '计算结果无误，进入下一题！');
    }
  });

  loadLevel(1);
}
