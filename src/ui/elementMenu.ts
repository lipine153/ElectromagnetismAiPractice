import { PARAM_SPECS, elementDomain, elementLabel } from '../scene/catalog';
import { isTwoNodeCircle } from '../scene/geometry';
import { addNodeAfter, insertNodeAt, removeNode } from '../scene/ops';
import type { SceneStore } from '../scene/store';
import { PARTICLE_RUN_CODE, readParticleRun, type Vec3 } from '../scene/types';
import { createParamControl, linkParamControls, type ParamControl } from './params';

export interface MenuTarget {
  id: string;
  /** 命中的节点下标（导线才有） */
  node?: number | null;
  /** 3D 命中点，用于「在此插入节点」 */
  point?: Vec3 | null;
}

export interface MenuContent {
  title: string;
  items: HTMLElement[];
}

function makeButton(label: string, danger: boolean, action: () => void, close: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = danger ? 'ctx__item ctx__item--danger' : 'ctx__item';
  button.textContent = label;
  button.addEventListener('click', () => {
    close();
    action();
  });
  return button;
}

/**
 * 构造某个要素/节点的菜单内容。3D 视口的右键菜单、工作栏的菜单都复用它，
 * 保证「选中要素 → 改参数 / 增删节点 / 删除」在哪都是同一套。
 */
export function buildMenuContent(
  store: SceneStore,
  target: MenuTarget,
  close: () => void,
): MenuContent | null {
  const element = store.snapshot.elements.find((e) => e.id === target.id);
  if (!element) return null;

  const nodeIndex = target.node ?? null;
  const items: HTMLElement[] = [];

  if (nodeIndex !== null) {
    items.push(
      makeButton('在此之后插入节点', false, () => addNodeAfter(store, element.id, nodeIndex), close),
    );
    if ((element.nodes?.length ?? 0) > 2) {
      items.push(makeButton('删除该节点', true, () => removeNode(store, element.id, nodeIndex), close));
    }
    return { title: `节点 ${nodeIndex + 1}`, items };
  }

  const controls: ParamControl[] = [];
  const onChange = linkParamControls(controls);
  for (const spec of PARAM_SPECS[element.kind] ?? []) {
    controls.push(createParamControl(store, element, spec, onChange));
  }
  items.push(...controls.map((control) => control.root));

  if (element.kind === 'freeCharge') {
    // 放开 / 重置 / 清除轨迹（都在工作菜单里，顶栏不堆东西）
    const params = element.params;
    const run = readParticleRun(params.run);
    const setRun = (next: number, bumpTrail: boolean): void => {
      store.updateElement(element.id, {
        params: {
          ...params,
          run: next,
          trailSeq: (params.trailSeq ?? 0) + (bumpTrail ? 1 : 0),
        },
      });
    };

    if (run !== 'running') {
      items.push(
        makeButton(run === 'held' ? '放开 ▶' : '继续 ▶', false, () =>
          setRun(PARTICLE_RUN_CODE.running, false), close),
      );
    }
    // 重置要连轨迹一起清：轨迹是一条连续折线，笔头瞬移回起点会画出一条假直线
    items.push(makeButton('重置（回起点）', false, () => setRun(PARTICLE_RUN_CODE.held, true), close));
    items.push(makeButton('清除轨迹', false, () => setRun(params.run ?? 0, true), close));
  }

  if (element.kind === 'straightWire') {
    // 圆环：可在「整体平移 / 旋转平面」之间切换（TransformControls 一次只挂一个 gizmo）
    if (isTwoNodeCircle(element)) {
      const toRotate = store.snapshot.wireTool === 'move';
      items.push(
        makeButton(
          toRotate ? '切换为旋转工具' : '切换为平移工具',
          false,
          () => store.setWireTool(toRotate ? 'rotate' : 'move'),
          close,
        ),
      );
    }
    items.push(
      makeButton(
        '添加节点（末端）',
        false,
        () => addNodeAfter(store, element.id, (element.nodes?.length ?? 1) - 1),
        close,
      ),
    );
    if (target.point) {
      const point = target.point;
      items.push(makeButton('在此插入节点', false, () => insertNodeAt(store, element.id, point), close));
    }
  }

  items.push(makeButton('删除', true, () => store.removeElement(element.id), close));

  return {
    title: `${elementDomain(element.kind)} · ${elementLabel(element.kind, element.params)}`,
    items,
  };
}
