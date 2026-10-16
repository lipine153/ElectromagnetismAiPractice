# 电磁学沙盒 · 计算闯关

一个面向大学电磁学的**交互式三维场可视化沙盒** + **计算题闯关**。沙盒里的电场线、磁场线、可编辑通电导线、螺线管、磁偶极子、自由点电荷轨迹全部由 C++ 编译成 WebAssembly 的场引擎**实时计算**，不是预先烘好的动画。

## 在线体验

| 页面 | 地址 |
|---|---|
| 🧲 **电磁学沙盒**（3D 场可视化，默认入口） | https://lipine153.github.io/ElectromagnetismAiPractice/ |
| 🎯 **计算闯关**（10 关电磁计算题） | https://lipine153.github.io/ElectromagnetismAiPractice/quiz.html |

两个页面是**互通**的：闯关第 5 / 6 / 7 关有「在沙盒中查看 →」按钮，会把该关的物理量（比如 `n=500 匝/m、I=2 A`）通过深链带进沙盒并自动把模型搭好；沙盒顶栏的「闯关」按钮会跳回**你来的那一关**。

## 功能

### 沙盒

- **电场线 / 磁场线**：按强度自适应色阶 + 线宽分档，强度一眼可辨；方向箭头可开关；线密度分三档。
- **一切皆可选中**：点选或右键任一要素，抽屉的「工作」栏是场景清单，右键就是编辑入口。
- **通电导线可编辑**：拖动节点改折线形状、增删节点、整体平移、圆环可绕圆心旋转；开放导线的两端按「延伸到无穷远」处理。
- **螺线管**：在渲染侧展开成一叠同轴圆电流环，内部 `B = μ₀nI` 与有限长修正都对得上。
- **磁偶极子**：理想偶极子场，画成指示磁矩方向的箭头。
- **自由点电荷**（有质量的试探电荷）：`m·dv/dt = q(E + v×B)` 用 **Boris push** 实时积分（纯磁场下能量严格守恒）；先像放点电荷一样确定位置、用「移动/旋转」瞄初速度方向，再从工作菜单点「放开 ▶」开始模拟；轨迹渲染成**荧光笔**样式的绿色光带。
- 所有物理量都用 **KaTeX 排版**（`1.00×10⁻⁹ C`），不打印 `1.0e-9`。

### 闯关

- 10 道电磁计算题（高斯定理、介质中的场、面电荷密度、导体电势、长直导线磁场、螺线管、自感、互感……）。
- 拖选结果填空、计时计分、即时判题；模型示意图为内联 SVG。

## 技术栈

- **前端**：Vite + TypeScript + Tailwind CSS v4 + three.js
- **物理**：C++（无第三方数学库）→ WebAssembly（Emscripten）
  - 有限长直导线段 Biot–Savart、完全椭圆积分（AGM）的精确圆环场、理想偶极子场、Boris push 粒子推进
- **公式排版**：KaTeX

## 本地运行

需要 [Bun](https://bun.sh)：

```bash
bun install
bun run dev        # http://localhost:5173
```

其他脚本：

```bash
bun run typecheck     # 只做类型检查
bun run build         # tsc --noEmit && vite build -> dist/
bun run preview       # 预览 dist/
bun run build:offline # 单文件离线版 -> dist-offline/（双击即用，可直接发给别人）
```

> `file://` 直接打开源码目录是不行的：ES 模块和 `.wasm` 都会被 CORS 拦掉，请用 `bun run dev`（或任何 http server）；想双击运行就用 `build:offline` 的产物。

### 重新编译 WebAssembly

`public/bin/field_line.{js,wasm}` **已经入库**，只改前端的话不需要重新编译。改了 `cpp/` 里任何东西才需要：

```bash
pwsh -File scripts/build.ps1   # 需要 Emscripten + CMake + Ninja
```

## 目录结构

```
index.html / quiz.html   两个入口（沙盒 / 闯关）
src/
  scene/                 场景状态、要素目录、导线几何、深链预设
  physics/               Wasm 封装（唯一跨界处）、撒种点集
  render/                three.js：场线、导线、粒子、场景
  ui/                    顶栏、抽屉、右键菜单、参数控件
  game/ src/models/      闯关逻辑与 SVG 模型图
cpp/                     场引擎：field / integrator / bindings
public/bin/              已入库的 wasm 产物
scripts/                 构建脚本（wasm / 离线单文件）
```

## 作者与贡献者

- **作者**：[lipine153](https://github.com/lipine153)
- **贡献者**：[opencode](https://opencode.ai)（AI 编程助手，本项目绝大部分代码与文档由它编写，作者负责提出需求、校验物理结果与验收交互）
  在 GitHub 上体现为 [`opencode-agent[bot]`](https://github.com/apps/opencode-agent)
