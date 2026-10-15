/** 物理模型种类（与 src/models 的 SVG 生成器一一对应） */
export type ModelKind =
  | 'sphere-concentric'
  | 'sphere-dielectric'
  | 'sphere-solid'
  | 'sphere-cavity'
  | 'wire'
  | 'solenoid'
  | 'coil'
  | 'coils-coupled'
  | 'inductor';

/** 单个关卡配置 */
export interface Level {
  readonly title: string;
  /** 题干，内含 KaTeX：\\(..\\) 行内、\\[..\\] 块级 */
  readonly question: string;
  readonly options: readonly string[];
  /** 每个填空槽的标题；槽位顺序即下标顺序 */
  readonly areaNames: readonly string[];
  /** 槽位下标 -> 正确数值字符串 */
  readonly answer: Readonly<Record<number, string>>;
  readonly model: ModelKind;
}

export const levels: readonly Level[] = [
  {
    title: '第1关 同心导体球电场计算',
    question: `
高斯定理 \\[\\oint_S \\mathbf{E} \\cdot d\\mathbf{S} = \\frac{q_{\\text{enc}}}{\\epsilon_0}\\]
内球壳半径 \\(R_1 = 0.1m\\)，电荷量 \\(q = 8 \\times 10^{-9}\\)，
外球壳内半径 \\(R_2 = 0.2m\\)，电荷量 \\(-q\\)，

\\(\\frac{1}{4\\pi \\epsilon_0} = 9 \\times 10^9 N·m²/C²\\)，

求：\\(R_1<r<R_2\\) 区域电场强度 \\(E_1(N/C)\\)，
\\(r>R_2\\) 区域电场强度 \\(E_2(N/C)\\)
    `,
    options: ['720', '1800', '0', '3600', '900'],
    areaNames: ['区域 \\(R_1<r<R_2\\) 电场 \\(E_1\\)', '区域 \\(r>R_2\\) 电场 \\(E_2\\)'],
    answer: { 0: '720', 1: '0' },
    model: 'sphere-concentric',
  },
  {
    title: '第2关 介质同心球电场',
    question: `
介质中电场 \\[E = \\frac{q}{4\\pi \\epsilon_0 \\epsilon_r r^2}\\]
总带电量 \\(q = 8\\pi \\epsilon_0\\ (C)\\)，
介质区半径 \\(r = 1m\\)（紫色虚线内），
介质内电场 \\(E = 1\\ (N/C)\\)，
求：相对介电常数 \\(\\epsilon_r\\)，介质外电场 \\(E_{true}\\)
    `,
    options: ['1', '2', '4', '0.5', '8'],
    areaNames: ['相对介电常数 \\(\\varepsilon_r\\)', '真空区域电场 \\(E_{\\text{true}}\\)'],
    answer: { 0: '2', 1: '2' },
    model: 'sphere-dielectric',
  },
  {
    title: '第3关 面电荷密度σ计算',
    question: `
\\[\\sigma = \\frac{q}{S},\\quad S=4\\pi R^2\\]
球体半径 \\(R=0.2\\ \\text{m}\\)，总电荷 \\(q=5\\times 10^{-8}\\ \\text{C}\\)
求：电荷面密度 \\(\\sigma\\ (\\text{C/m}^2)\\)，近似取 \\(4\\pi=12.5\\)
    `,
    options: ['1e-7', '2e-7', '5e-8', '8e-8', '3e-7'],
    areaNames: ['导体球面电荷密度 \\(\\sigma\\)'],
    answer: { 0: '1e-7' },
    model: 'sphere-solid',
  },
  {
    title: '第4关 导体电势计算',
    question: `
\\[U = \\dfrac{q}{4\\pi\\epsilon_0 R}\\]
孤立导体球，带电 \\(q=9\\times 10^{-9}C\\)，\\(R=0.1\\ \\text{m}\\)，
\\(\\dfrac{1}{4\\pi\\epsilon_0}=9\\times 10^9\\ \\text{N·m}^2/\\text{C}^2\\)，
求导体电势 \\(U\\)
    `,
    options: ['810', '900', '720', '450', '1620'],
    areaNames: ['导体电势 \\(U\\)'],
    answer: { 0: '810' },
    model: 'sphere-cavity',
  },
  {
    title: '第5关 长直导线磁场B',
    question: `
\\[B = \\frac{\\mu_0 I}{2\\pi r}\\] \\(\\mu_0=4\\pi\\times 10^{-7}(T·m/A)\\)
电流 \\(I=10\\,\\text{A}\\)，距离导线 \\(r=0.2\\,\\text{m}\\)
求 \\(r\\) 处磁感应强度 \\(B\\ (T)\\)
    `,
    options: ['1e-5', '2e-5', '4e-5', '5e-6', '8e-6'],
    areaNames: ['导线外磁感应强度 \\(B\\)'],
    answer: { 0: '1e-5' },
    model: 'wire',
  },
  {
    title: '第6关 螺线管匀强磁场',
    question: `
\\[B = \\mu_0 n I\\]
单位长度匝数 \\(n=500\\,\\text{匝/m}\\)，电流 \\(I=2\\,\\text{A}\\)
\\(\\mu_0=4\\pi\\times 10^{-7}(T·m/A)\\)，近似 \\(4\\pi=12.56\\)
求磁感应强度 \\(B\\ (T)\\)
    `,
    options: ['1.256e-3', '2.512e-3', '6.28e-4', '3.14e-3', '5e-4'],
    areaNames: ['螺线管内部磁感应强度 \\(B\\)'],
    answer: { 0: '1.256e-3' },
    model: 'solenoid',
  },
  {
    title: '第7关 线圈自感 L',
    question: `
\\[L = \\dfrac{\\Psi}{I}\\] 磁链 \\(\\Psi=N\\Phi\\)
匝数 \\(N=200\\)，单匝磁通量 \\(\\Phi=2\\times 10^{-5}\\,\\text{Wb}\\)，
电流 \\(I=0.4\\,\\text{A}\\)，
求电感 \\(L\\ (\\text{H})\\)
    `,
    options: ['0.01', '0.1', '0.05', '0.02', '0.2'],
    areaNames: ['自感系数 \\(L\\)'],
    answer: { 0: '0.01' },
    model: 'coil',
  },
  {
    title: '第8关 自感电动势',
    question: `
\\[\\epsilon_L = -L \\cdot \\dfrac{dI}{dt}\\]
\\(L=0.02\\,\\text{H}\\)，电流变化率 \\(\\dfrac{\\Delta I}{\\Delta t}=500\\,\\text{A/s}\\)
求感应电动势大小 \\(\\epsilon_L\\ (\\text{V})\\)
    `,
    options: ['5', '10', '20', '1', '2'],
    areaNames: ['自感电动势 \\(\\varepsilon_L\\)'],
    answer: { 0: '10' },
    model: 'coil',
  },
  {
    title: '第9关 互感系数 M',
    question: `
\\[M = \\frac{\\Psi_{21}}{I_1}\\]
线圈 1 电流 \\(I_1=5\\,\\text{A}\\)，在线圈 2 产生磁链 \\(\\Psi_{21}=0.15\\,\\text{Wb}\\)
求互感 \\(M\\ (\\text{H})\\)
    `,
    options: ['0.01', '0.03', '0.05', '0.15', '0.3'],
    areaNames: ['互感系数 \\(M\\)'],
    answer: { 0: '0.03' },
    model: 'coils-coupled',
  },
  {
    title: '第10关 综合计算 串联互感',
    question: `
\\[L_{all} = L_1 + L_2 + 2M\\]
\\(L_1=0.04\\,\\text{H}\\)，\\(L_2=0.06\\,\\text{H}\\)，\\(M=0.02(H)\\)
求顺向串联总电感 \\(L_{all}(H)\\)
    `,
    options: ['0.10', '0.14', '0.18', '0.08', '0.20'],
    areaNames: ['串联总电感 \\(L_{all}\\)'],
    answer: { 0: '0.14' },
    model: 'inductor',
  },
];

export const TOTAL_LEVELS = levels.length;
export const LEVEL_SECONDS = 120;
