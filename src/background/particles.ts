interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  color: string;
}

const COUNT = 120;
const rand = (min: number, max: number): number => min + Math.random() * (max - min);

/** 启动背景粒子动画 */
export function startParticles(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let w = (canvas.width = window.innerWidth);
  let h = (canvas.height = window.innerHeight);

  const particles: Particle[] = Array.from({ length: COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: rand(1, 3),
    vx: rand(-0.2, 0.2),
    vy: rand(-0.2, 0.2),
    color: `rgba(255,255,255,${rand(0.2, 0.7).toFixed(2)})`,
  }));

  const update = (p: Particle): void => {
    p.x = p.x < 0 ? w : p.x > w ? 0 : p.x + p.vx;
    p.y = p.y < 0 ? h : p.y > h ? 0 : p.y + p.vy;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  };

  const frame = (): void => {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) update(p);
    requestAnimationFrame(frame);
  };

  window.addEventListener('resize', () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  });

  requestAnimationFrame(frame);
}
