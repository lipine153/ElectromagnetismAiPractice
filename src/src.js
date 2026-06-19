// 粒子背景
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
let w = canvas.width = window.innerWidth;
let h = canvas.height = window.innerHeight;
let particles = [];
class Particle {
    constructor(){
        this.x = Math.random()*w;
        this.y = Math.random()*h;
        this.r = Math.random()*2+1;
        this.vx = Math.random()*0.4-0.2;
        this.vy = Math.random()*0.4-0.2;
        this.color = `rgba(139,92,246,${Math.random()*0.5+0.2})`;
    }
    draw(){
        ctx.beginPath();
        ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
    update(){
        this.x += this.vx;
        this.y += this.vy;
        if(this.x<0)this.x=w;
        if(this.x>w)this.x=0;
        if(this.y<0)this.y=h;
        if(this.y>h)this.y=0;
        this.draw();
    }
}
for(let i=0;i<150;i++) particles.push(new Particle());
function animateParticles(){
    ctx.clearRect(0,0,w,h);
    particles.forEach(p=>p.update());
    requestAnimationFrame(animateParticles);
}
animateParticles();
window.addEventListener('resize',()=>{
    w=canvas.width=window.innerWidth;
    h=canvas.height=window.innerHeight;
});

// 全局游戏变量
const totalLevel = 10;
let nowLevel = 1;
let score = 0;
let timer = 120;
let timerTimer = null;
let dragNumList = [];
let dropAreaList = [];
let rightAnswer = {};

// ========== 10关计算题配置(纯文本公式,无乱码) ==========
const levelData = [
    // 第1关:单层同心导体球 电场强度计算 高斯定理
    {
        title: "第1关 同心导体球电场计算",
        question: `
高斯定理 \\[\\oint_S \\mathbf{E} \\cdot d\\mathbf{S} = \\frac{q_{\\text{enc}}}{\\epsilon_0}\\]
内球壳半径 \\(R_1 = 0.1m\\),
外球壳内半径 \\(R_2 = 0.2m\\),
电荷量 \\(q = 8 \\times 10^{-9}\\),
\\(\\epsilon = 8.85 \\times 10^{-12} C^2/(N·m^2)\\),
\\(\\frac{1}{4\\pi \\epsilon_0} = 9 \\times 10^9 N·m²/C²\\)

\\(R_2\\)区域电场强度 \\(E_1(N/C)\\) 
区域电场强度\\(E_2(N/C)\\)
        `,
        options: ["720","1800","0","3600","900"],
        areaNames: ["区域R₁<r<R₂ 电场E₁","区域r>R₂ 电场E₂"],
        answer: {0:"720",1:"0"},
        model: "sphere1"
    },
    // 第2关:同心球+电介质 相对介电常数+电场
    {
        title: "第2关 介质同心球电场",
        question: `
介质中电场\\[E = \\frac{q}{4\\pi \\epsilon_0 \\epsilon_r r^2}\\]
总带电量 \\(q = 4\\pi \\epsilon_0 \\times 2 C \\),
介质区半径 \\(r = 1m\\),
内电场 \\(E = 1 (N/C)\\),
求: 介电常数 \\(\\epsilon_r\\),域电场 \\(E_{true}\\)
        `,
        options: ["1","2","4","0.5","8"],
        areaNames: ["相对介电常数εᵣ","真空区域电场E_true"],
        answer: {0:"2",1:"2"},
        model: "sphere2"
    },
    // 第3关:导体球面电荷密度计算
    {
        title: "第3关 面电荷密度σ计算",
        question: `
\\[\\sigma = \\frac{q}{S},\\quad S=4\\pi R^2\\]
球体半径 \\(R=0.2,\\text {m}\\),总电荷 \\(q=5\\times 10^{-8}\\text {C}\\)
电荷面密度 \\(\\sigma\ (\\text {C/m}^2)\\),近似取 \\(4\\pi=12.5\\)
        `,
        options: ["1e-7","2e-7","5e-8","8e-8","3e-7"],
        areaNames: ["导体球面 σ"],
        answer: {0:"1e-7"},
        model: "sphere3"
    },
    // 第4关:空腔导体 电势计算
    {
        title: "第4关 导体电势计算",
        question: `
\\[U = \\dfrac{q}{4\\pi\\epsilon_0 R}\\]
孤立导体球,\\(q=9\\times 10^{-9}\\,\\text {C}\\),\\(R=0.1\\text {m}\\),\\(\\dfrac {1}{4\\pi\\epsilon_0}=9\\times 10^9\\text {N・m}^2/\\text {C}^2\\)
求电势 \\(U(V)\\)
        `,
        options: ["810","900","720","450","1620"],
        areaNames: ["导体电势 U"],
        answer: {0:"810"},
        model: "cavity"
    },
    // 第5关:长直载流导线 磁感应强度B
    {
        title: "第5关 长直导线磁场B",
        question: `
\\[B = \\frac{\\mu_0 I}{2\\pi r}\\]\\(\\mu_0=4\\pi\\times 10^{-7}(T·m/A)\\)
电流 \\(I=10\,\\text {A}\\),距离导线 \\(r=0.2\,\\text {m}\\)
求磁感应强度 \\(B\ (\\text {T})\\)
        `,
        options: ["1e-5","2e-5","4e-5","5e-6","8e-6"],
        areaNames: ["导线外 B"],
        answer: {0:"1e-5"},
        model: "wire"
    },
    // 第6关:无限长螺线管 磁场计算
    {
        title: "第6关 螺线管匀强磁场",
        question: `
\\[B = \\mu_0 n I\\]
单位长度匝数 \\(n=500\,\\text {匝 /m}\\),电流 \\(I=2\,\\text {A}\\)
\\(\\mu_0=4\\pi\\times 10^{-7}(T・m/A)\\),近似 \\(4\\pi=12.56\\)
求磁感应强度 \\(B\ (T)\\)
        `,
        options: ["1.256e-3","2.512e-3","6.28e-4","3.14e-3","5e-4"],
        areaNames: ["螺线管内部 B"],
        answer: {0:"1.256e-3"},
        model: "solenoid"
    },
    // 第7关:单线圈自感系数L计算
    {
        title: "第7关 线圈自感 L",
        question: `
\\[L = \\dfrac {\\Psi}{I}\\]磁链 \\(\\Psi=N\\Phi\\)
匝数 \\(N=200\\),单匝磁通量 \\(\\Phi=2\\times 10^{-5}\,\\text {Wb}\\),电流 \\(I=0.4\,\\text {A}\\)
求电感 \\(L\ (\\text {H})\\)
        `,
        options: ["0.01","0.1","0.05","0.02","0.2"],
        areaNames: ["自感系数 L"],
        answer: {0:"0.01"},
        model: "selfInd"
    },
    // 第8关:自感电动势计算
    {
        title: "第8关 自感电动势",
        question: `
\\[\\epsilon_L = -L \\cdot \\dfrac{d I}{d t}\\]
\\(L=0.02\,\\text {H}\\),电流变化率 \\(\\dfrac {\\Delta I}{\\Delta t}=500\,\\text {A/s}\\)
求感应电动势大小 \\(\\epsilon_L\ (\\text {V})\\)
        `,
        options: ["5","10","20","1","2"],
        areaNames: ["自感电动势 ε_L"],
        answer: {0:"10"},
        model: "selfInd2"
    },
    // 第9关:双线圈互感系数M
    {
        title: "第9关 互感系数 M",
        question: `
\\[M = \\frac{\\Psi_{21}}{I_1}\\]
线圈 1 电流 \\(I_1=5\,\\text {A}\\),在线圈 2 产生磁链 \\(\\Psi_{21}=0.15\,\\text {Wb}\\)
求互感 \\(M\ (\\text {H})\\)
        `,
        options: ["0.01","0.03","0.05","0.15","0.3"],
        areaNames: ["互感系数 M"],
        answer: {0:"0.03"},
        model: "mutual"
    },
    // 第10关:互感串联等效电感
    {
        title: "第10关 综合计算 串联互感",
        question: `
\\[L_{all} = L_1 + L_2 + 2M\\]
\\(L_1=0.04\,\\text{H}\\),\\(L_2=0.06\\text{H}\\) \\(M=0.02(H)\\)
求顺向串联总电感 \\(L_{all}(H)\\)
        `,
        options: ["0.10","0.14","0.18","0.08","0.20"],
        areaNames: ["串联总电感 L总"],
        answer: {0:"0.14"},
        model: "final"
    }
];

// 页面初始化
window.onload = function(){
    initLevelBtn();
    loadLevel(1);
    bindAllEvent();
    renderAllMath();
};

// KaTeX
function renderAllMath(){
    renderMathInElement(document.body, {
    delimiters: [
        {left: "\\(", right: "\\)", display: false}, // 行内
        {left: "\\[", right: "\\]", display: true}  // 块级
    ],
    ignoredClasses: ["katex"]
    });
};

// 生成关卡按钮
function initLevelBtn(){
    const box = document.getElementById('levelSelect');
    for(let i=1;i<=totalLevel;i++){
        let btn = document.createElement('button');
        btn.className = "px-4 py-2 rounded-lg border border-indigo-400 hover:bg-indigo-600 transition";
        btn.innerText = `第${i}关`;
        btn.onclick = ()=>loadLevel(i);
        box.appendChild(btn);
    }
}

// 加载指定关卡
function loadLevel(lev){
    nowLevel = lev;
    let cfg = levelData[lev-1];
    document.getElementById('levelNum').innerText = lev;
    let questionTextEle = document.getElementById('questionText');
    questionTextEle.replaceChildren();
    questionTextEle.innerHTML += cfg.question;
    renderAllMath()

    rightAnswer = cfg.answer;

    renderModel(cfg.model);
    renderNumOptions(cfg.options);
    renderDropAreas(cfg.areaNames);
    resetTimer();

}

// 渲染物理模型
function renderModel(type){
    const mBox = document.getElementById('physicsModel');
    let line = `<div class="field-line w-24"></div>`;
    let html = "";
    switch(type){
        case "sphere1":
            html = `<div class="sphere-box">
                        <div class="sphere" style="width:80px;height:80px;"></div>
                        <div class="sphere" style="width:160px;height:160px;"></div>
                    </div><p class="mt-4 text-cyan-200">双层同心导体球模型</p>`;
            break;
        case "sphere2":
            html = `<div class="sphere-box">
                        <div class="sphere" style="width:70px;height:70px;"></div>
                        <div class="sphere" style="width:140px;height:140px;border:dashed #c084fc;"></div>
                        <div class="sphere" style="width:220px;height:220px;"></div>
                    </div><p class="mt-4 text-cyan-200">含电介质同心球</p>`;
            break;
        case "sphere3":
            html = `<div class="sphere-box">
                        <div class="sphere" style="width:180px;height:180px;"></div>
                    </div><p class="mt-4 text-cyan-200">孤立导体球</p>`;
            break;
        case "cavity":
            html = `<div class="sphere-box">
                        <div class="sphere" style="width:120px;height:120px;border:dashed;"></div>
                        <div class="sphere" style="width:240px;height:240px;"></div>
                    </div><p class="mt-4 text-cyan-200">空腔导体模型</p>`;
            break;
        case "wire":
            html = `<div class="w-12 h-80 bg-gradient-to-b from-blue-400 to-blue-700 relative"></div>
                    <p class="mt-4 text-cyan-200">长直载流导线</p>`;
            break;
        case "solenoid":
            html = `<div class="coil"></div><p class="mt-4 text-cyan-200">无限长螺线管</p>`;
            break;
        case "selfInd":
        case "selfInd2":
            html = `<div class="coil" style="border-color:#facc15;"></div><p class="mt-4 text-cyan-200">单匝线圈(自感)</p>`;
            break;
        case "mutual":
            html = `<div class="flex gap-4">
                        <div class="coil" border-color:#34d399;"></div>
                        <div class="coil" border-color:#fb7185;"></div>
                    </div><p class="mt-4 text-cyan-200">双耦合线圈(互感)</p>`;
            break;
        case "final":
            html = `<div class="flex flex-wrap gap-6 justify-center items-center">
                        <div class="coil" style="border-radius: 10px;width: 15em;"></div>
                    </div><p class="mt-4 text-cyan-200">耦合电感</p>`;
            break;
    }
    mBox.innerHTML = html;
}

// 渲染可选数值
function renderNumOptions(arr){
    const dBox = document.getElementById('numDragBox');
    dBox.innerHTML = "";
    dragNumList = [];
    arr.forEach((val,idx)=>{
        let div = document.createElement('div');
        div.className = "num-item";
        div.draggable = true;
        div.innerText = val;
        div.dataset.val = val;
        dBox.appendChild(div);
        dragNumList.push(div);
    });
}

// 渲染答题填空区域
function renderDropAreas(arr){
    const dBox = document.getElementById('calcDropBox');
    dBox.innerHTML = "";
    dropAreaList = [];
    arr.forEach((name,idx)=>{
        let div = document.createElement('div');
        div.className = "calc-area";
        div.dataset.id = idx;
        div.innerHTML = `<span class="text-gray-400">${name}</span>`;
        dBox.appendChild(div);
        dropAreaList.push(div);
    });
}

// 计时器
function resetTimer(){
    clearInterval(timerTimer);
    timer = 120;
    document.getElementById('timer').innerText = timer;
    timerTimer = setInterval(()=>{
        timer--;
        document.getElementById('timer').innerText = timer;
        if(timer <= 0){
            clearInterval(timerTimer);
            showModal(false,"时间耗尽","计算超时,闯关失败,请重新计算作答");
        }
    },1000);
}

// 弹窗提示
function showModal(isPass,title,desc){
    let modal = document.getElementById('resultModal');
    let icon = document.getElementById('modalIcon');
    let t = document.getElementById('modalTitle');
    let d = document.getElementById('modalDesc');
    let nextBtn = document.getElementById('nextLevel');
    if(isPass){
        icon.className = "fa fa-check-circle text-green-400";
        t.innerText = "计算正确！";
        nextBtn.classList.remove('hidden');
    }else{
        icon.className = "fa fa-times-circle text-red-400";
        t.innerText = title;
        nextBtn.classList.add('hidden');
    }
    d.innerText = desc;
    modal.classList.add('show');
}

// 绑定所有事件
function bindAllEvent(){
    // 拖拽
    document.addEventListener('dragstart',e=>{
        if(e.target.classList.contains('num-item')){
            e.dataTransfer.setData('text',e.target.dataset.val);
        }
    });
    document.addEventListener('dragover',e=>{
        e.preventDefault();
        let area = e.target.closest('.calc-area');
        if(area) area.classList.add('hover');
    });
    document.addEventListener('dragleave',e=>{
        let area = e.target.closest('.calc-area');
        if(area) area.classList.remove('hover');
    });
    document.addEventListener('drop',e=>{
        e.preventDefault();
        let val = e.dataTransfer.getData('text');
        let area = e.target.closest('.calc-area');
        if(!area) return;
        area.classList.remove('hover');
        area.innerHTML = `<div class="num-item">${val}</div>`;
    });

    // 重置
    document.getElementById('resetBtn').onclick = ()=>{
        loadLevel(nowLevel);
    };

    // 提交答案 校验计算结果
    document.getElementById('submitBtn').onclick = ()=>{
        let allOk = true;
        dropAreaList.forEach(area=>{
            let idx = area.dataset.id;
            let child = area.querySelector('.num-item');
            let ans = rightAnswer[idx];
            if(!child || child.innerText !== ans){
                allOk = false;
                area.classList.add('wrong');
                setTimeout(()=>area.classList.remove('wrong'),400);
            }else{
                area.classList.add('correct');
            }
        });
        if(allOk){
            clearInterval(timerTimer);
            score += 100;
            document.getElementById('score').innerText = score;
            if(nowLevel === totalLevel){
                showModal(true,"全部通关",`恭喜完成全部${totalLevel}道电磁计算题,总分:${score}`);
                document.getElementById('nextLevel').classList.add('hidden');
            }else{
                showModal(true,"作答正确","计算结果无误,进入下一题！");
            }
        }else{
            showModal(false,"结果错误","部分数值计算有误,请核对公式与计算过程后重试");
        }
    };

    // 关闭弹窗、下一关
    document.getElementById('modalClose').onclick = ()=>{
        document.getElementById('resultModal').classList.remove('show');
    };
    document.getElementById('nextLevel').onclick = ()=>{
        document.getElementById('resultModal').classList.remove('show');
        loadLevel(nowLevel+1);
    };
}