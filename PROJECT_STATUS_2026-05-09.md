# Plice 警擎项目 — 当前状态

> 更新时间：2026-05-09 15:20

---

## 一、项目基本信息

- **项目名**：智警引擎（Plice）—— 基于多源感知的智慧警务决策平台
- **赛道**：青创未来
- **slogan**：智警引擎——基于多源感知的智慧警务决策平台
- **技术栈**：YOLO视频检测 + 语音识别 + Flask后端 + SSE实时推送 + OpenLayers地图
- **前端**：纯静态HTML/JS/CSS，部署于 Cloudflare Workers（KV assets）
- **后端**：Flask（端口8000）+ cloudflared tunnel
- **CF Worker**：https://plice.ejuer-z.workers.dev
- **当前Tunnel**：https://comedy-experience-internationally-their.trycloudflare.com
- **仓库**：本地项目，未上传 GitHub

---

## 二、当前运行状态

| 服务 | 状态 | 地址/端口 |
|------|------|----------|
| Flask | 运行中 | localhost:8000 |
| cloudflared | 运行中 | https://comedy-experience-internationally-their.trycloudflare.com |
| CF Worker | 已部署 | https://plice.ejuer-z.workers.dev |

**注意**：cloudflared 每次重启 tunnel URL 会变，需要更新 `wrangler.toml` 中的 `PLICE_BACKEND_URL` 并重新 `npx wrangler deploy`。

---

## 三、近期完成的修复（2026-05-09）

### 1. F12 DevTools 布局崩溃（960px 断点问题）
- **根因**：Chrome DevTools 打开后可视宽度 ≤960px，触发响应式断点，把 fixed 侧栏变成横向堆叠
- **修复**：新增 `@media (max-width: 960px)` 独立覆盖块，`body.command-page--standalone` 页面在断点内还原 fixed 侧栏布局
- **涉及页面**：所有带 `command-page--standalone` 的独立模块页

### 2. HTML 重复 class 属性
- **根因**：多个 HTML 元素写了两个 `class=""` 属性，浏览器只识别最后一个
- **修复**：
  - `command-map.html` 第34行：`<section class="app-shell" class="mb-3">` → `class="app-shell mb-3"`
  - `command-map.html` 第35行：`<p class="hint muted" class="mb-2">` → `class="hint muted mb-2"`
  - `command-map.html` 第57行：两个 class 合并，`class="officer-brief-map-canvas map-canvas"`

### 3. app.js null check 缺失
- **根因**：`downloadJsonBtn` 只存在于部分页面，全局执行时报 null
- **修复**：`document.getElementById("downloadJsonBtn")` → `document.getElementById("downloadJsonBtn")?.`

### 4. 侧栏宽度调整
- sidebar：260px → 280px
- header `grid-template-columns`：260px → 280px
- body padding-left：`calc(260px + 16px)` → `calc(280px + 16px)`
- 960px 断点 standalone 覆盖全部对齐 280px

### 5. 导航项顶部空隙
- `.command-app-nav` 添加显式 `padding-top: 0`

### 6. 研判页面标题上方空隙
- `.command-page-head` 添加 `padding-top: 6px`

### 7. index.html 补充 `command-page--standalone` 类
- 使其与其他独立模块页一致，避免 960px 断点干扰

---

## 四、当前仍存在的问题

### 待确认：地图尺寸为 0（command-map.html）
- **现象**：`No map visible because the map container's width or height are 0`
- **可能原因**：`map-canvas` 使用 `height: 58vh`，如果外层容器 `command-situation-card__body` 高度为 0，vh 计算为 0
- **需验证**：访问 `https://plice.ejuer-z.workers.dev/command-map.html` 地图是否正常显示（需互联网访问 OSM 底图）

### 待确认：console 残留日志
- `command-map.js:108` 的报错是之前访问 `command-map.html` 的残留，不是当前页面问题
- Chrome 不会自动清理跨页面的 console 日志

---

## 五、项目文件结构

```
plice/
├── web/
│   ├── index.html          # 接警研判主页（已有 command-page--standalone）
│   ├── judgments.html      # 研判记录（standalone，有 data-theme="light"）
│   ├── command-map.html    # 地图中心（有 command-page--standalone）
│   ├── command-situation.html  # 指挥态势
│   ├── tech-route.html     # 技术路线
│   ├── app.js              # 主逻辑（含接警、研判、地图调用）
│   ├── sidebar.js          # 侧边栏注入（NAV_ITEMS 定义在第3行）
│   ├── api.js              # API 层（judgments.js/command-analysis.js 迁移而来）
│   ├── utils.js
│   ├── officer-brief-map.js  # OpenLayers 地图封装
│   ├── command-map.js
│   ├── styles.css          # 合并后的单一 CSS 文件（~142KB）
│   └── docs-theme.js
├── wrangler.toml           # CF Worker 配置（PLICE_BACKEND_URL 需随 tunnel 变化更新）
├── REFACTOR_PLAN.md        # 重构计划文档
└── PROJECT_STATUS_2026-05-09.md  # 本文件
```

---

## 六、关键 CSS 变量（--cmd-*）

在 `:root` 第91-98行定义了深色主题默认值，浅色主题在第102-108行用 `!important` 覆盖：

```css
:root {
  --cmd-accent: #0085d0;
  --cmd-accent-soft: rgba(0, 133, 208, 0.12);
  --cmd-surface: #0b0f16;         /* 浅色主题覆盖为 #ffffff */
  --cmd-surface-alt: #111827;      /* 浅色主题覆盖为 #f8fafc */
  --cmd-text: #e2e8f0;             /* 浅色主题覆盖为 #1a1a1a */
  --cmd-muted: #64748b;
  --cmd-border: rgba(255, 255, 255, 0.08);
  --cmd-border-accent: rgba(0, 133, 208, 0.3);
}
```

---

## 七、下一步待办

1. [ ] 验证 `command-map.html` 地图是否正常（需外网访问 OSM）
2. [ ] 确认 judgments.html 三个问题是否全部修复
3. [ ] 如果地图仍为 0，需查 `.command-situation-card` 的高度约束
4. [ ] prettier 格式化（网络恢复后）
5. [ ] 更新 REFACTOR_PLAN.md 完成状态

---

## 八、快捷命令

```bash
# 重启 tunnel
cd /Users/ejuer/Desktop/平台/plice
cloudflared tunnel --url http://localhost:8000

# 更新 wrangler.toml 中的 PLICE_BACKEND_URL 后部署
npx wrangler deploy

# 本地启动 Flask
cd /Users/ejuer/Desktop/平台/plice
python api_server.py  # 或 python main.py
```
