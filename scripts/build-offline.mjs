/**
 * 单文件离线构建：把每个页面打成**自包含的 HTML**。
 *
 * 内联内容：JS（IIFE，无 ESM 导入）、CSS、woff2 字体（丢掉 woff/ttf 老格式）、
 * 以及 base64 的 wasm（通过 window.__FIELD_LINE_WASM__ 交给胶水，免去 fetch）。
 * 产物在 dist-offline/，可直接双击（file://）打开，也可整包发给别人。
 *
 * 用法：bun run build:offline
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { build } from 'vite';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'dist-offline');
const PAGES = ['index.html', 'quiz.html'];
const GLUE = join(ROOT, 'public/bin/field_line.js');
const WASM = join(ROOT, 'public/bin/field_line.wasm');

const escapeScript = (js) => js.replace(/<\/script/gi, '<\\/script');
const escapeStyle = (css) => css.replace(/<\/style/gi, '<\\/style');

/** 在若干候选目录里找到某个相对路径指向的实体文件 */
function locate(relative, ...bases) {
  const rel = relative.replace(/^\.?\//, '');
  for (const base of bases) {
    const candidate = resolve(base, rel);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** CSS 里的字体：删掉 woff/ttf/otf/eot，只把 woff2 内联成 data URI */
function inlineFonts(css, cssDir) {
  let out = css.replace(/url\(([^)]+\.(?:woff|ttf|otf|eot))\)\s*format\([^)]*\)/gi, '');
  out = out.replace(/,\s*;/g, ';');
  out = out.replace(/url\(([^)]+\.woff2)\)/gi, (match, path) => {
    const file = locate(path, cssDir, OUT, ROOT);
    if (!file) return match;
    return `url(data:font/woff2;base64,${readFileSync(file).toString('base64')})`;
  });
  return out;
}

async function buildPage(page) {
  await build({
    root: ROOT,
    configFile: false,
    base: './',
    plugins: [tailwindcss()],
    logLevel: 'warn',
    build: {
      outDir: 'dist-offline',
      emptyOutDir: false,
      // 资源不自动内联，交给下面统一处理（这样才好只保留 woff2）
      assetsInlineLimit: 0,
      cssCodeSplit: false,
      modulePreload: false,
      target: 'es2020',
      rollupOptions: {
        input: join(ROOT, page),
        output: { format: 'iife', inlineDynamicImports: true },
      },
    },
  });
}

function inlinePage(page) {
  const htmlPath = join(OUT, page);
  let html = readFileSync(htmlPath, 'utf8');
  let appScript = '';

  // 入口 JS：先摘出来，最后统一放到 </body> 之前。
  // Vite 会把 <script type="module"> 放到 <head>（module 会自动延迟执行），
  // 但内联后变成经典脚本会立即执行、此时 <body> 还不存在，所以必须挪到末尾。
  html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>\s*/g, (match, src) => {
    const jsPath = locate(src, OUT, ROOT);
    if (!jsPath) return match;
    appScript = `<script>\n${escapeScript(readFileSync(jsPath, 'utf8'))}\n</script>\n`;
    return '';
  });

  // <link rel="stylesheet"> -> <style>
  html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (match, href) => {
    const cssPath = locate(href, OUT, ROOT);
    if (!cssPath) return match;
    const css = inlineFonts(readFileSync(cssPath, 'utf8'), dirname(cssPath));
    return `<style>\n${escapeStyle(css)}\n</style>`;
  });

  html = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, '');

  // 胶水脚本 -> 内嵌 wasm + 经典内联脚本
  // 注意：替换串一律用「回调函数」形式，避免内容里的 $&/$'/$` 被当成替换模式
  const glue = escapeScript(readFileSync(GLUE, 'utf8'));
  const wasmBase64 = readFileSync(WASM).toString('base64');
  html = html.replace(
    /<script src="\.\/bin\/field_line\.js"><\/script>/g,
    () => `<script>window.__FIELD_LINE_WASM__="${wasmBase64}";</script>\n<script>\n${glue}\n</script>`,
  );

  // 应用脚本放到最后，确保 DOM 已就绪
  html = html.replace(/<\/body>/i, () => `${appScript}</body>`);

  if ((html.match(/<!DOCTYPE/gi) ?? []).length !== 1) {
    throw new Error(`${page}: 内联后文档结构异常（DOCTYPE 出现多次），已中止`);
  }

  writeFileSync(htmlPath, html);
  return html.length;
}

async function main() {
  if (!existsSync(GLUE) || !existsSync(WASM)) {
    throw new Error('缺少 public/bin/field_line.js / .wasm，请先运行 scripts/build.ps1');
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  for (const page of PAGES) {
    await buildPage(page);
    const bytes = inlinePage(page);
    console.log(`[offline] ${page}  ->  ${(bytes / 1024).toFixed(0)} KB  自包含`);
  }

  // 全部内联完毕，assets/ 与 bin/ 已无引用
  rmSync(join(OUT, 'assets'), { recursive: true, force: true });
  rmSync(join(OUT, 'bin'), { recursive: true, force: true });
  console.log(`[offline] 完成：${OUT}`);
}

main().catch((err) => {
  console.error('[offline] 构建失败:', err);
  process.exit(1);
});
