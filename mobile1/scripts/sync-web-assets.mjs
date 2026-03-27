import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const repoRoot = resolve(projectRoot, "..");
const srcDist = resolve(repoRoot, "dist");
const targetWeb = resolve(projectRoot, "assets", "web");
const targetIndex = resolve(targetWeb, "index.html");
const targetAssets = resolve(targetWeb, "assets");

if (!existsSync(srcDist)) {
  throw new Error(`未找到 dist 目录: ${srcDist}。请先在根目录执行 npm run build`);
}

if (existsSync(targetWeb)) {
  rmSync(targetWeb, { recursive: true, force: true });
}
mkdirSync(targetWeb, { recursive: true });
cpSync(srcDist, targetWeb, { recursive: true });

const indexHtml = readFileSync(targetIndex, "utf8")
  .replace(/(src|href)=["']\/assets\//g, '$1="assets/');

const inlinedHtml = indexHtml
  .replace(/<link\s+[^>]*href=["']assets\/([^"']+\.css)["'][^>]*>/g, (_match, cssFile) => {
    const cssPath = resolve(targetAssets, cssFile);
    const css = readFileSync(cssPath, "utf8");
    return `<style>\n${css}\n</style>`;
  })
  .replace(
    /<script\s+type=["']module["'][^>]*src=["']assets\/([^"']+\.js)["'][^>]*><\/script>/g,
    (_match, jsFile) => {
      const jsPath = resolve(targetAssets, jsFile);
      const js = readFileSync(jsPath, "utf8");
      return `<script type="module">\n${js}\n</script>`;
    },
  );

writeFileSync(targetIndex, inlinedHtml, "utf8");

console.log("web 资源已同步到 mobile1/assets/web（已内联 JS/CSS，适配 iOS 离线 WebView）");
