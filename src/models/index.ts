import type { ModelKind } from '../game/levels';

/** 图上标注：LaTeX（由 KaTeX 渲染），坐标为 SVG viewBox 单位 */
interface ModelLabel {
  tex: string;
  x: number;
  y: number;
}

interface Model {
  /** SVG 内部标记（不含文字，文字见 labels） */
  svg: string;
  caption: string;
  labels: ModelLabel[];
}

const VIEW_W = 320;
const VIEW_H = 280;

/** 转义 HTML 元字符，避免 LaTeX 里的 < > & 破坏标记 */
const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 生成一堆叠放的椭圆，用于表示线圈匝数 */
function turns(cx: number, cy: number, rx: number, ry: number, count: number, step: number, cls = 'm-coil'): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    const dy = (i - (count - 1) / 2) * step;
    out += `<ellipse class="${cls}" cx="${cx}" cy="${cy + dy}" rx="${rx}" ry="${ry}"/>`;
  }
  return out;
}

const MODELS: Record<ModelKind, Model> = {
  'sphere-concentric': {
    caption: '双层同心导体球模型',
    svg: `
      <circle class="m-fill" cx="160" cy="140" r="100"/>
      <circle class="m-line" cx="160" cy="140" r="100"/>
      <circle class="m-fill" cx="160" cy="140" r="52"/>
      <circle class="m-line" cx="160" cy="140" r="52"/>
      <line class="m-line m-line--soft" x1="160" y1="140" x2="212" y2="140"/>
      <line class="m-line m-line--soft" x1="160" y1="140" x2="260" y2="140"/>`,
    labels: [
      { tex: 'R_1', x: 188, y: 126 },
      { tex: 'R_2', x: 218, y: 160 },
    ],
  },
  'sphere-dielectric': {
    caption: '含电介质同心球',
    svg: `
      <circle class="m-fill" cx="160" cy="140" r="120"/>
      <circle class="m-line m-line--dielectric" cx="160" cy="140" r="120"/>
      <circle class="m-line" cx="160" cy="140" r="78"/>
      <circle class="m-fill" cx="160" cy="140" r="40"/>
      <circle class="m-line" cx="160" cy="140" r="40"/>
      <line class="m-line m-line--soft" x1="160" y1="140" x2="238" y2="140"/>
      <line class="m-line m-line--soft" x1="160" y1="140" x2="280" y2="140"/>`,
    labels: [
      { tex: 'r', x: 198, y: 126 },
      { tex: '\\varepsilon_r', x: 246, y: 158 },
    ],
  },
  'sphere-solid': {
    caption: '孤立导体球',
    svg: `
      <circle class="m-fill" cx="160" cy="140" r="95"/>
      <circle class="m-line" cx="160" cy="140" r="95"/>
      <line class="m-line m-line--soft" x1="160" y1="140" x2="255" y2="140"/>`,
    labels: [
      { tex: 'R', x: 208, y: 126 },
      { tex: 'q', x: 160, y: 142 },
    ],
  },
  'sphere-cavity': {
    caption: '空腔导体模型',
    svg: `
      <circle class="m-fill" cx="160" cy="140" r="108"/>
      <circle class="m-line" cx="160" cy="140" r="108"/>
      <circle cx="160" cy="140" r="42" fill="var(--color-bg)"/>
      <circle class="m-line m-line--soft" cx="160" cy="140" r="42"/>`,
    labels: [
      { tex: 'R', x: 208, y: 126 },
      { tex: 'q', x: 160, y: 142 },
    ],
  },
  wire: {
    caption: '长直载流导线',
    svg: `
      <line class="m-wire" x1="160" y1="28" x2="160" y2="252"/>
      <circle class="m-field" cx="160" cy="140" r="34"/>
      <circle class="m-field" cx="160" cy="140" r="62"/>
      <circle class="m-field" cx="160" cy="140" r="90"/>`,
    labels: [
      { tex: 'I', x: 180, y: 42 },
      { tex: 'r', x: 234, y: 140 },
    ],
  },
  solenoid: {
    caption: '无限长螺线管',
    svg: `
      ${turns(160, 140, 74, 16, 6, 30)}
      <line class="m-line m-line--soft" x1="60" y1="140" x2="260" y2="140"/>`,
    labels: [{ tex: 'n,\\ I', x: 104, y: 54 }],
  },
  coil: {
    caption: '线圈（自感）',
    svg: `${turns(160, 140, 86, 66, 3, 14)}`,
    labels: [{ tex: 'N', x: 234, y: 80 }],
  },
  'coils-coupled': {
    caption: '双耦合线圈（互感）',
    svg: `
      ${turns(104, 140, 56, 44, 3, 10)}
      ${turns(216, 140, 56, 44, 3, 10, 'm-coil m-coil--alt')}`,
    labels: [
      { tex: 'L_1', x: 104, y: 212 },
      { tex: 'L_2', x: 216, y: 212 },
    ],
  },
  inductor: {
    caption: '耦合电感',
    svg: `
      <path class="m-coil" d="M64 140
        a18 18 0 0 1 36 0 a18 18 0 0 1 36 0
        a18 18 0 0 1 36 0 a18 18 0 0 1 36 0
        a18 18 0 0 1 36 0"/>
      <line class="m-line m-line--soft" x1="64" y1="140" x2="46" y2="140"/>
      <line class="m-line m-line--soft" x1="244" y1="140" x2="262" y2="140"/>`,
    labels: [{ tex: 'L_1 + L_2 + 2M', x: 154, y: 192 }],
  },
};

/** 渲染某个模型：SVG + 用 KaTeX 定位的图上标注（调用方需再跑一次 renderMath） */
export function renderModelSvg(kind: ModelKind): string {
  const model = MODELS[kind];
  const labels = model.labels
    .map((label) => {
      const left = ((label.x / VIEW_W) * 100).toFixed(3);
      const top = ((label.y / VIEW_H) * 100).toFixed(3);
      return `<span class="model__tex" style="left:${left}%;top:${top}%">${esc(label.tex)}</span>`;
    })
    .join('');

  return `
    <div class="model__stage">
      <svg class="model__svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="${model.caption}">
        ${model.svg.trim()}
      </svg>
      ${labels}
    </div>
    <p class="model__caption">${model.caption}</p>`;
}
