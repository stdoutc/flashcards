# 联想记忆卡片

一款基于间隔重复算法的闪卡学习应用，支持 Web 端与移动端（Expo WebView 离线壳），具备联想知识图谱构建与 AI 辅助制卡功能。

## 功能概览

### 卡组管理
- 创建、编辑、删除卡组，支持 JSON 格式导入 / 导出
- 卡片支持 Markdown 正文与 KaTeX 数学公式渲染
- 卡片可插入图片（base64 内嵌）

### 间隔重复学习
- 仿 Anki SM-2 调度算法，分 `new / learning / relearning / review` 四个阶段
- 每次作答后选择 **再来一遍 / 困难 / 良好 / 简单**，系统自动计算下次复习间隔
- 每日新卡上限可在设置中自定义
- 卡片熟练度 0–4 级，达到最高级后自动标记为"已掌握"并从队列中退休

### 联想模式
- 以卡片为节点，手动构建有向树状知识图谱
- 支持小地图预览与节点聚焦导航
- 独立的联想回忆练习页，按树形结构逐步回忆

### AI 辅助制卡（实验室）
- 上传课本 / 笔记截图，调用豆包（Doubao）多模态 API 自动识别并生成闪卡
- 支持"快速"与"精准"两种提示词模式
- 生成结果可逐张预览、编辑后批量导入卡组

### 统计
- 展示各卡组今日新学、复习数量及总体掌握程度分布

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 6 |
| 路由 | React Router v6 |
| 内容渲染 | react-markdown + KaTeX + rehype-raw |
| 图形布局 | d3-flextree（联想树） |
| 数据持久化 | localStorage（`localStore.ts`） |
| 移动端 | Expo + WebView（离线加载本地构建产物） |

## 快速开始

### Web 端

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 移动端（Expo 离线壳）

```bash
# 1. 先构建 Web 版本
npm run build

# 2. 同步构建产物到移动端资源目录
cd mobile
npm run sync-web

# 3. 安装依赖并启动 Expo
npm install
npm run start
```

> 移动端通过 `file://` 协议加载打包好的 `index.html`，完全离线运行，无需网络。

## 目录结构

```
flashcard/
├── src/
│   ├── domain/          # 核心领域模型与调度算法
│   │   ├── models.ts         # 数据类型定义
│   │   ├── scheduler.ts      # SM-2 间隔重复调度器
│   │   ├── assocTree.ts      # 联想树数据结构
│   │   └── ...
│   ├── pages/           # 页面组件
│   │   ├── StudyPage.tsx     # 学习 / 复习页
│   │   ├── CardEditPage.tsx  # 卡片编辑页
│   │   ├── LabAssocPage.tsx  # 联想图谱编辑页
│   │   ├── LabPage.tsx       # AI 制卡实验室
│   │   ├── StatsPage.tsx     # 统计页
│   │   └── ...
│   ├── components/      # 通用组件（卡片渲染、弹窗、小地图等）
│   ├── services/        # 本地存储服务
│   ├── context/         # React Context（全局状态）
│   └── utils/           # 工具函数
├── mobile/              # Expo WebView 离线移动端壳
├── docs/                # 项目文档与截图
├── demo-import-decks/   # 示例卡组（可直接导入体验）
└── public/
```

## 示例卡组

`demo-import-decks/` 目录下提供了可直接导入的示例卡组：

- `english-association-demo-deck.json` — 英语联想记忆示例
- `maozedong-thought-outline-tree-*.json` — 毛泽东思想纲要树形联想示例

在应用首页点击"导入卡组"即可加载。

## 许可证

本项目为个人学习 / 实习项目，仅供参考与学习使用。
