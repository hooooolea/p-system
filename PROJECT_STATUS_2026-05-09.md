# Plice 警擎 — 项目状态

> 更新时间：2026-05-09 19:30

---

## 一、项目概览

- **项目名**：智警引擎（Plice）
- **赛道**：青创未来
- **slogan**：智警引擎——基于多源感知的智慧警务决策平台
- **技术栈**：YOLO 视频检测 + 语音识别 + Flask 后端 + SSE 实时推送 + OpenLayers 地图
- **前端**：纯静态 HTML/JS/CSS，Cloudflare Workers 部署
- **后端**：Flask（端口 8000）+ cloudflared tunnel
- **CF Worker**：`https://plice.ejuer-z.workers.dev`
- **本地 tunnel**：`https://oldest-river-swing-measure.trycloudflare.com`

---

## 二、运行状态

| 服务 | 状态 | 地址 |
|------|------|------|
| Flask | 本地运行 | localhost:8000 |
| cloudflared tunnel | 运行中 | `https://oldest-river-swing-measure.trycloudflare.com` |
| CF Worker | 已部署（commit fa206d9） | `https://plice.ejuer-z.workers.dev` |

> 每次重启 cloudflared，tunnel URL 会变。需要更新 `wrangler.toml` 的 `PLICE_BACKEND_URL` 并重新 `npx wrangler deploy`。

---

## 三、已解决问题（本次重构）

### 1. Header 布局重构
- **旧问题**：header inner 使用 `grid-template-columns: 280px 1fr auto`，把侧栏宽度硬编码进 header 布局，导致 brand 和 sidebar 耦合
- **修复**：header 改为单行 flex，brand 左 + right 右，`margin-left: auto` 推 right 到右侧
- **文件**：styles.css（`.command-shell-header__inner`）

### 2. Sidebar 独立 fixed 布局
- **旧问题**：sidebar 依赖 header 的 grid 单元格定位，`top: var(--command-header-height)` 是脆弱的 hack
- **修复**：sidebar 完全独立，固定 `top: 52px; height: calc(100vh - 52px); width: 240px`，不再受 header 布局影响
- **文件**：styles.css（`.command-app-sidebar`）

### 3. 地图容器尺寸为 0
- **症状**：`No map visible because the map container's width or height are 0`
- **根因**：CSS 有重复 `.command-situation-card__body` 定义，第二个只设 `padding: 0`，覆盖了第一个的 flex 布局，导致 `map-canvas` 高度链断裂
- **修复**：删除重复选择器，确保 `.command-situation-card__body` 有完整 flex 属性
- **文件**：styles.css

### 4. 地图 flex 布局链
- **布局链**：`body.map-command-page` → `.doc-main.command-app-body`（flex column） → `.command-app-panel.panel--stream`（flex:1） → `.command-situation-card`（flex:1） → `.command-situation-card__body`（flex:1） → `.map-canvas`（flex:1, min-height:380px）
- **文件**：styles.css（960px 断点 override + map-command-page 专属 override）

### 5. 重复 class 属性（历史问题）
- **根因**：HTML 元素写了两个 `class=""` 属性，浏览器只识别最后一个，前一个 class 丢失
- **涉及**：command-situation.html（4处）、judgments.html（1处）、command-map.html（多处）
- **修复**：合并为单一 class 属性

### 6. useRag checkbox 位置
- **修复**：从 header 中间的游离 `<input id="useRag">` 移入 header right，包装在 `<label class="hdr-toggle">` 中，与状态指示器同行

---

## 四、当前文件结构

```
plice/
├── web/
│   ├── index.html              # 接警研判主页
│   ├── command-situation.html # 指挥态势（视频流管理）
│   ├── command-map.html       # 地图中心（OpenLayers）
│   ├── judgments.html          # 研判记录纵览
│   ├── tech-route.html         # 技术路线
│   ├── app.js                  # 主逻辑（接警/研判/视频/SSE）
│   ├── api.js                  # API 封装层
│   ├── utils.js                # 工具函数（fetchWithTimeout 等）
│   ├── sidebar.js              # 侧栏导航（innerHTML 动态渲染）
│   ├── officer-brief-map.js    # OpenLayers 地图封装
│   ├── command-map.js          # 地图中心业务逻辑
│   ├── plice-env.js            # 环境变量（动态获取 tunnel-url）
│   └── styles.css              # 全部样式（~142KB，单一文件）
├── cf-worker/
│   └── router.mjs              # CF Worker 路由（静态文件 + API 代理 + tunnel-url）
├── wrangler.toml               # CF Worker 配置
├── api_server.py               # Flask 后端入口
└── PROJECT_STATUS.md          # 本文件
```

---

## 五、页面结构规范（四个模块页统一）

所有独立模块页（command-situation / command-map / judgments / index）遵循以下结构：

```html
<body class="docs-shell docs-shell--command-workbench command-page--standalone [page-specific-classes]">
  <div class="site">
    <!-- Header：单行 flex，brand 左 + right 右 -->
    <header class="site-header command-shell-header page-wide">
      <div class="command-shell-header__inner">
        <div class="command-shell-header__brand">
          <span class="command-shell-header__brand-mark"></span>
          <span class="command-shell-header__brand-text">智警引擎</span>
          <span class="command-shell-header__brand-ver">智慧警务</span>
        </div>
        <div class="command-shell-header__right">
          <!-- 状态 pill / RAG toggle / 时钟 -->
        </div>
      </div>
    </header>

    <!-- Main：fixed sidebar + 右侧内容区 -->
    <main class="site-main command-shell-main">
      <div class="command-app page-wide">
        <aside id="app-sidebar" class="command-app-sidebar"></aside>
        <div class="doc-main command-app-body">
          <!-- 页面内容 -->
        </div>
      </div>
    </main>
  </div>
</body>
```

### CSS 布局规则

| 元素 | 定位方式 | 关键属性 |
|------|---------|---------|
| `.site` | 正常流向 | 无特殊 |
| `.site-header` | relative，z-index 覆盖 | `height: 52px` |
| `.command-shell-header__inner` | flex 单行 | `height: 52px; justify-content: space-between` |
| `.command-shell-header__right` | flex | `margin-left: auto` 推右 |
| `.site-main` | 正常流向 | 无特殊 |
| `.command-app` | flex row（命令行布局） | 无固定宽度 |
| `.command-app-sidebar` | **fixed** | `top: 52px; left: 0; width: 240px; height: calc(100vh - 52px)` |
| `.command-app-body` | flex:1 | `padding-left: calc(240px + 20px)` |

---

## 六、地图页面（command-map.html）布局链

```
body.map-command-page
  └── .doc-main.command-app-body    [display:flex; flex-direction:column; min-height:0]
       └── .command-app-panel.panel--stream  [flex:1; min-height:0]
            └── .command-situation-card       [flex:1; min-height:0]
                 └── .command-situation-card__body  [flex:1; min-height:0; display:flex; flex-direction:column]
                      └── #commandMapCanvas.map-canvas  [flex:1; min-height:380px]
```

> 每一级都需要 `flex:1` + `min-height:0` 才能把高度传递到底层。

---

## 七、关键 CSS 变量（--cmd-*）

```css
:root {
  --cmd-accent: #0085d0;
  --cmd-accent-soft: rgba(0, 133, 208, 0.12);
  --cmd-surface: #0b1120;          /* 浅色主题覆盖为 #ffffff */
  --cmd-surface-alt: #111827;       /* 浅色主题覆盖为 #f8fafc */
  --cmd-text: #e2e8f0;              /* 浅色主题覆盖为 #1a1a1a */
  --cmd-muted: #64748b;
  --cmd-border: rgba(255, 255, 255, 0.08);
  --cmd-border-accent: rgba(0, 133, 208, 0.3);
}
```

浅色主题在 `:root[data-theme="light"]` 中用 `!important` 覆盖上述变量。

---

## 八、待办

- [ ] 验证 command-map.html 地图是否正常渲染（需外网访问 OSM）
- [ ] 960px 断点内实测侧栏行为是否符合预期
- [ ] prettier 格式化 styles.css

---

## 九、快捷命令

```bash
# 重启 tunnel（URL 会变）
cd ~/Desktop/平台/plice
cloudflared tunnel --url http://localhost:8000

# 部署 CF Worker
npx wrangler deploy

# 本地启动 Flask
cd ~/Desktop/平台/plice
python api_server.py
```
