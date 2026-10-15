import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface Scene3D {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly orbit: OrbitControls;
  readonly canvas: HTMLCanvasElement;
  onFrame(cb: () => void): void;
  onResize(cb: () => void): void;
  size(): { width: number; height: number };
}

/** 建立 three.js 场景：渲染器 / 相机 / 轨道控制 / 灯光 / 网格 */
export function createScene3D(container: HTMLElement): Scene3D {
  const scene = new THREE.Scene();
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
  scene.background = new THREE.Color(bg || '#060913');

  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
  camera.position.set(4.5, 3.4, 5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.minDistance = 1.2;
  orbit.maxDistance = 60;
  // 右键让给上下文菜单，平移改到中键（滚轮缩放不变）
  orbit.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: null,
  };

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(5, 8, 6);
  scene.add(key);

  // 参考网格（中性色，不抢戏）。不显示 XYZ 坐标轴。
  const grid = new THREE.GridHelper(10, 10, 0x2c3242, 0x1b2130);
  scene.add(grid);

  const frameCbs: Array<() => void> = [];
  const resizeCbs: Array<() => void> = [];

  const size = (): { width: number; height: number } => ({
    width: container.clientWidth || window.innerWidth,
    height: container.clientHeight || window.innerHeight,
  });

  const resize = (): void => {
    const { width, height } = size();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    for (const cb of resizeCbs) cb();
  };

  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(container);
  resize();

  const loop = (): void => {
    requestAnimationFrame(loop);
    for (const cb of frameCbs) cb();
    orbit.update();
    renderer.render(scene, camera);
  };
  loop();

  return {
    scene,
    camera,
    renderer,
    orbit,
    canvas: renderer.domElement,
    onFrame: (cb) => {
      frameCbs.push(cb);
    },
    onResize: (cb) => {
      resizeCbs.push(cb);
    },
    size,
  };
}
