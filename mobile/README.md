# mobile - Expo WebView 离线壳

本目录是“方案一：Expo 壳 + WebView 直接加载现有网页版”的独立实现。

## 使用方式

1. 在仓库根目录先构建网页版本：

```bash
npm run build
```

2. 同步网页构建产物到 `mobile/assets/web`：

```bash
cd mobile
npm run sync-web
```

3. 安装依赖并启动 Expo：

```bash
npm install
npm run start
```

## 离线说明

- `mobile/assets/web` 会被打包进 App 资源中；
- `App.tsx` 通过 `file://` 方式加载本地 `index.html`；
- `sync-web-assets.mjs` 会自动把 `dist/index.html` 内的 `/assets/...` 改成相对路径 `assets/...`，保证离线加载静态资源。
