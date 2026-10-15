import './styles/app.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const LINE_COUNT = 12;
const START_RADIUS = 1.5;
const START_Z = 1.0;
const STEP_SIZE = 0.03;
const MAX_STEPS = 100000;

// ===================== 场景 =====================
const scene = new THREE.Scene();
// 场景底色跟随设计令牌，避免再写死一个颜色
const bgToken = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
scene.background = new THREE.Color(bgToken || '#04100f');

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(6, 6, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AxesHelper(3));
scene.add(new THREE.GridHelper(10, 10, 0x333344, 0x222233));

const colorTmp = new THREE.Color();

/** 追踪并渲染一条磁力线 */
function addFieldLine(wasm: FieldLineModuleInstance, startX: number, startY: number): void {
  const countPtr = wasm._malloc(4);
  const dataPtr = wasm._traceFieldLine(startX, startY, START_Z, STEP_SIZE, MAX_STEPS, countPtr);
  const pointCount = wasm.getValue(countPtr, 'i32');
  if (pointCount <= 0) {
    wasm._free(countPtr);
    return;
  }

  const floatData = new Float32Array(wasm.HEAPF32.buffer, dataPtr, pointCount * 4);

  // 场强范围（用于配色）
  let maxB = -Infinity;
  let minB = Infinity;
  for (let i = 0; i < pointCount; i++) {
    const b = floatData[i * 4 + 3];
    if (Number.isFinite(b) && b > 1e-8) {
      maxB = Math.max(maxB, b);
      minB = Math.min(minB, b);
    }
  }
  if (maxB - minB <= 1e-6) minB = maxB * 0.5;

  const positions: number[] = [];
  const colors: number[] = [];
  const logMin = Math.log10(minB * 0.1);
  const logMax = Math.log10(maxB);

  for (let i = 0; i < pointCount; i++) {
    positions.push(floatData[i * 4], floatData[i * 4 + 1], floatData[i * 4 + 2]);
    // 对数映射：压缩动态范围，弱场区域的颜色变化才可见（蓝→青→黄→红）
    const safeB = Math.max(floatData[i * 4 + 3], minB * 0.1);
    const t = Math.min(1, Math.max(0, (Math.log10(safeB) - logMin) / (logMax - logMin)));
    colorTmp.setHSL(0.65 - 0.65 * t, 1.0, 0.6);
    colors.push(colorTmp.r, colorTmp.g, colorTmp.b);
  }

  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  geometry.setColors(colors);

  const material = new LineMaterial({ linewidth: 2.5, vertexColors: true, color: 0xffffff });
  material.resolution.set(window.innerWidth, window.innerHeight);

  scene.add(new Line2(geometry, material));

  wasm._freeFieldLine(dataPtr);
  wasm._free(countPtr);
}

// ===================== 启动 =====================
FieldLineModule()
  .then((wasm) => {
    for (let i = 0; i < LINE_COUNT; i++) {
      const angle = (i / LINE_COUNT) * Math.PI * 2;
      addFieldLine(wasm, START_RADIUS * Math.cos(angle), START_RADIUS * Math.sin(angle));
    }
    window.dispatchEvent(new Event('field-lines-ready'));
  })
  .catch((err: unknown) => {
    console.error('Wasm 初始化失败:', err);
    window.dispatchEvent(new Event('field-lines-failed'));
  });

function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  scene.traverse((obj) => {
    const material = (obj as unknown as { material?: { resolution?: THREE.Vector2 } }).material;
    material?.resolution?.set(window.innerWidth, window.innerHeight);
  });
});
