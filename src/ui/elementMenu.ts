import { PARAM_SPECS, elementDomain, elementLabel } from '../scene/catalog';
import { isTwoNodeCircle } from '../scene/geometry';
import { addNodeAfter, insertNodeAt, removeNode } from '../scene/ops';
import type { SceneStore } from '../scene/store';
import type { Vec3 } from '../scene/types';
import { createParamControl } from './params';

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

  for (const spec of PARAM_SPECS[element.kind] ?? []) {
    items.push(createParamControl(store, element, spec));
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
