import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // 相对路径产物：兼容 GitHub Pages 子路径，也方便本地预览
  base: './',
  plugins: [tailwindcss()],
  server: {
    // 本机 Vite 默认只绑 IPv6 (::1)，浏览器若把 localhost 解析到 127.0.0.1 就会「拒绝连接」。
    // 绑 :: 是双栈，IPv4 与 IPv6 都能访问。
    host: '::',
    port: 5173,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      // 多页：index.html = 模拟页（默认入口），quiz.html = 答题闯关
      input: {
        simulate: 'index.html',
        quiz: 'quiz.html',
      },
    },
  },
});
