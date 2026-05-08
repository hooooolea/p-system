下面是一份**面向开发与维护**的完整技术讲解，覆盖你当前仓库里「接警工作台 + 多页面指挥壳 + 地图 + 案件闭环 + 可选持久化」的整体设计与关键实现路径。

---

## 一、系统定位与运行形态

本项目是一个**演示级智慧警务工作台**：  
- **主入口**：Flask 提供 HTML/静态资源与 JSON API（`api_server.py`）。  
- **前端**：以 `web/` 下多页 HTML + `app.js` / 各页独立 JS 为主；地图模块另有一套 **Vite 构建的 `map-app/`**，构建产物由 Flask 挂在 `/command-map/`。  
- **可选持久化**：研判快照可走 **Supabase**（未配置则全部内存会话）。

本地典型启动：

```bash
python api_server.py
# 默认监听 8000，静态页与 API 同源
```

---

## 二、总体架构（分层）

```
浏览器
  ├─ 静态页 web/*.html + styles.css + docs-theme.js + 各页 *.js
  └─ 地图 SPA（map-app/dist，路径 /command-map/）
        ↓ fetch
Flask api_server.py
  ├─ 会话态 SessionStore（内存）
  ├─ 业务服务 services/*（研判、布控、案件、地理等）
  ├─ 可选 adapters/persistence/supabase_analysis.py
  └─ 内部专网 API：adapters/http/blueprint.py → /internal/v1/*
```

**设计要点**：  
- **UI 与业务解耦**：复杂流程放在 `services/`，`api_server.py` 只做路由、组装 JSON、会话读写。  
- **研判一条链**：接警文本 → LLM 结构化 → 可选 RAG → 可选布控二次 LLM → 快照落内存/Supabase。  
- **地图一条链**：历史/快照 → 解析 `geo` / LLM 输出 / 规则推断 → 前端 OpenLayers 展示。

---

## 三、前端：页面与统一壳

### 3.1 布局约定（所有主业务页尽量一致）

- `body.docs-shell.docs-shell--command-workbench`  
- 顶栏：`site-header.command-shell-header.page-wide`（品牌、**全局搜索占位**、警号登录、部分页有主题切换）  
- 主体：`command-app.page-wide`  
  - 左：`command-app-sidebar`（SVG 导航 + 底部技术路线/退出登录）  
  - 右：`doc-main.command-app-body`（各页内容）

相关样式集中在 `web/styles.css`，用 CSS 变量（`--cmd-*`、`--command-header-height` 等）控制暗色指挥台视觉与对齐。

### 3.2 接警研判页（`/` → `web/index.html`）

- **警情接入**：`textarea#alarmText` + `开始研判` → `POST /api/analyze`。  
- **历史列表**：`GET /api/history` → `renderHistory()` 渲染为可点击条目，点击 `GET /api/analysis/:id` 恢复会话与展示。  
- **研判结果区**：折叠/展开（`workbenchResultsPanel`），内含摘要、关键信息、布控、简报地图、复核与下载。  
- **页内导航**：`hash` + `initWorkbenchInPageNav()`，侧栏 `href="#work-overview"` 等与主内容锚点联动。

### 3.3 研判记录总览（`/judgments`）

- `judgments.html` + `judgments.js`  
- 列表：`GET /api/history?limit=120`  
- 详情：`GET /api/analysis-presentation/:id` + `ar-presentation-render.js` 渲染专页布局。  
- 支持 URL：`/judgments?id=<analysis_id>` 自动选中并打开详情。

### 3.4 案件管理（`/command-analysis`）

- `command-analysis.html` + `command-analysis.js`  
- `GET /api/cases`：聚合 KPI + 卡片列表（与研判历史同源）。  
- `PATCH /api/cases/<analysis_id>`：人工更新 `case` 状态/进度。  
- 「发起新研判」跳转 `/`。

### 3.5 地图中心（`/command-map`）

- **生产**：Flask 从 `map-app/dist` 提供静态资源（`vite` 的 `base: "/command-map/"` 与资源路径一致）。  
- **开发**：`map-app` 内 `npm run dev`，`vite.config.js` 把 `/api` 等代理到 `localhost:8000`。  
- 地图逻辑在 `map-app/src/main.js`：OpenLayers 矢量点、悬停/选中样式、`GET /api/map-events`。

---

## 四、后端：Flask 入口与核心 API

文件：`api_server.py`

| 能力 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 研判 | POST | `/api/analyze` | 调用 `analyze_alarm_with_bukong`，写历史、快照、可选 Supabase |
| 历史 | GET | `/api/history` | Supabase 优先，否则内存 `analysis_history` |
| 研判快照 | GET | `/api/analysis/<id>` | 恢复单条到会话并返回完整载荷 |
| 专页展示 | GET | `/api/analysis-presentation/<id>` | presentation JSON |
| 专页反馈 | POST | `/api/analysis-presentation/<id>/feedback` | adopt/ignore，同步更新 `case` |
| 复核 | POST | `/api/review` | 写 `review_records`，并 `sync_case_from_review` |
| 地图点 | GET | `/api/map-events` | `resolve_geo_for_map` 统一落点 |
| 案件 | GET | `/api/cases` | 聚合列表 + KPI |
| 案件更新 | PATCH | `/api/cases/<id>` | 更新快照内 `case` + 可选 `case_mgmt` |

**会话模型**：`SessionStore` 继承 `dict` 但支持属性访问，与 `services/workbench_service.py` 里 `ensure_session_state` 默认字段对齐。

---

## 五、研判流水线（LLM + 可选 RAG + 布控）

### 5.1 研判主链路

1. `services/incident_service.py`：`analyze_incident()`  
   - 拼 `prompts.INCIDENT_ANALYSIS_PROMPT`  
   - `llm_factory.get_llm()` 调用模型  
   - `utils/json_utils.parse_llm_json` 解析 JSON  
   - `apply_risk_postprocess`、`attach_confidence_bundle` 做后处理与置信度说明  

2. `analyze_alarm_with_bukong()`（`workbench_service`）：研判后再跑布控 `generate_bukong_plan()`，失败不影响研判结果。

3. `finalize_analysis_persistence()`：  
   - `build_restore_snapshot_from_pack()` 生成快照（含 `presentation`、`geo`、`officer_brief`、`disposal_nav`、**`case` 默认**等）  
   - `remember_analysis_snapshot` 写入内存 `analysis_by_id`  
   - `persist_analysis_if_configured` 可选写入 Supabase  

### 5.2 结构化输出中的 `geo`（地图用）

`prompts.py` 要求 LLM 必填 `geo`（WGS84、`confidence` 0~1 等），服务端用 `resolve_geo_for_map()` 合并：

- LLM `geo` 优先  
- 否则规则 `infer_geo_from_text`（解析经纬度、区县、地标等）  
- 最后低置信展示兜底，保证地图可上图（演示策略）

---

## 六、地理与地图数据流

1. 研判快照里存 `snap["geo"]`（与 `resolve_geo_for_map` 一致）。  
2. `/api/map-events`：对每条历史项取 `alarm_text` + `result`（或快照），调用 `resolve_geo_for_map`，返回 `lon/lat/geo_source/geo_confidence/location_text/geo_notes` 等。  
3. 前端 `map-app`：`fromLonLat` 把 WGS84 投到 Web Mercator；底图 OSM 或自定义 XYZ（环境变量可扩展）。

**注意**：若将来叠国测局底图，需考虑 **GCJ-02 ↔ WGS84** 与当前数据约定是否一致。

---

## 七、案件管理闭环（你要求的「完全闭环」）

模块：`services/case_management.py`

- **列表**：`build_cases_payload()` 遍历 `history`，每条合并 `analysis_by_id` 或 Supabase `fetch_snapshot`。  
- **展示状态**：`effective_case_view()` — 专页 adopt/ignore 优先，其次手工 PATCH，再复核关键字启发。  
- **持久化**：`supabase/migrations/003_case_mgmt.sql` 增加 `case_mgmt`；`persist_analysis_if_configured` upsert 时带上 `case_mgmt`；`update_case_mgmt_if_configured` 用于 PATCH/反馈后增量更新。

与前端联动：

- `command-analysis.js` 拉 `/api/cases`，下拉改状态 → `PATCH`。  
- `POST .../feedback` 与 `POST /api/review` 会同步 `case`，KPI 随之变化。

---

## 八、内部专网接入（可选能力）

`adapters/http/blueprint.py` 注册在 `/internal/v1`：

- 上传、警情合并、incident 列表/详情等（`IngestService` + `IncidentRepository` 内存库）。  
- 工作台语音流水线会走这里（`app.js` 里 `callInternalApi` / `callInternalForm`）。

与「研判历史」是两条线：**接入警情** vs **研判记录**，案件页目前以研判为主轴聚合。

---

## 九、安全与演示边界（你心里要有数）

- 警号登录、`docs-theme.js`：本地 `localStorage` 演示，**不是**真实鉴权。  
- Supabase 用 **service_role** 仅服务端，**绝不能**进浏览器。  
- 地图坐标含 LLM 估计与兜底，**不等于测绘级警情坐标**。  
- 全局搜索若实现，应对 `q` 做长度限制、防 XSS（前端 `escHtml` 一类）、接口限流（可选）。

---

## 十、扩展路线（与之前「搜索规划」衔接）

若要做全局搜索，推荐顺序：

1. `GET /api/search?q=` 只搜研判（复用 history + snapshot 文本字段）。  
2. 并入 `/api/cases` 结果。  
3. 地图命中与 query 跳转。  
4. `Cmd/Ctrl+K` 与最近搜索。

---

## 十一、关键文件索引（便于你查代码）

| 领域 | 路径 |
|------|------|
| Flask 入口 | `api_server.py` |
| 研判 + 快照 + case 默认 | `src/services/workbench_service.py` |
| 案件逻辑 | `src/services/case_management.py` |
| LLM 研判 | `src/services/incident_service.py`、`src/prompts.py` |
| Supabase | `src/adapters/persistence/supabase_analysis.py`、`supabase/migrations/*.sql` |
| 主工作台 JS | `web/app.js` |
| 样式与壳 | `web/styles.css` |
| 地图 Vite | `map-app/vite.config.js`、`map-app/src/main.js` |

---

如果你希望这份讲解**落到某一块深挖**（例如：只讲「研判快照 JSON 字段与恢复一致性」或「只讲地图坐标优先级」），告诉我章节名我按那一块展开到接口字段级说明。