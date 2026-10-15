import 'katex/dist/katex.min.css';
import katex from 'katex';
import renderMathInElement from 'katex/contrib/auto-render';

/** 渲染某个根节点内的所有 KaTeX 公式（\\(..\\) 行内、\\[..\\] 块级） */
export function renderMath(root: HTMLElement): void {
  renderMathInElement(root, {
    delimiters: [
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    ignoredClasses: ['katex'],
    throwOnError: false,
  });
}

/** 直接渲染一段纯 LaTeX（图上标注用，不需要 \\(..\\) 包裹） */
export function renderTex(el: HTMLElement, tex: string): void {
  el.innerHTML = katex.renderToString(tex, { throwOnError: false });
}
