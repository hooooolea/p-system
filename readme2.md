

## 一、项目要解决的问题（计划书「背景/目标」可用）

面向**接警—研判—复核—布控辅助—态势/记录/统计**的演示型工作台：

- 接警员输入警情（文字为主，可接语音流水线演示）。
- 系统调用大模型输出**结构化研判**（类型、风险、摘要、关键信息、处置建议、法律依据等）。
- 可选 **RAG** 注入规程片段，增强可解释性。
- 同一次流程可生成**布控方案**（第二次 LLM，失败不阻断研判）。
- 研判结果可**复核、导出**，并进入**研判记录总览**与**案件管理**闭环。
- **地图**展示时段内警情点位（坐标来自 LLM + 规则兜底链路）。
- 可选 **Supabase** 跨进程恢复研判历史；未配置则全部在**服务端内存会话**中。

---

## 二、整体技术形态（计划书「技术路线/架构」可用）

| 层次 | 技术 | 作用 |
|------|------|------|
| Web 服务 | **Python Flask**（`api_server.py`） | 提供页面路由、静态资源、`/api/*` JSON、可选 `/internal/v1/*` 内部 API |
| 业务逻辑 | **`src/services/`** | 研判、布控、快照、案件、地理解析等，避免把业务堆在路由里 |
| LLM | **LangChain + 厂商适配**（`llm_factory.py` 等） | 研判与布控两次调用 |
| RAG | **Chroma**（见 `requirements.txt` 与 Chroma 路径配置） | 规程检索增强（可开关） |
| 前端主站 | **多页 HTML + 原生 JS + 单一大样式表** | `web/*.html`、`web/app.js`、`web/styles.css` |
| 地图子应用 | **Vite + OpenLayers**（`map-app/`） | 独立构建，`base: "/command-map/"`，由 Flask 挂载 `dist` |
| 主题/登录演示 | **`web/docs-theme.js`** | 明暗主题、警号本地演示登录 |
| 可选持久化 | **Supabase Postgres** + `supabase/migrations/*.sql` | `incident_analyses` 等表；服务端 `service_role` 写入 |

一句话：**Flask 是总线；主工作台是多页传统前端；地图是独立前端包；研判与案件状态以服务端会话+可选数据库为真源。**

---

## 三、网页逻辑：从用户打开浏览器到各模块（计划书「功能说明/用户流程」）

### 3.1 统一壳（所有主业务页的交互逻辑）

除地图 SPA 外，各业务页采用同一套**指挥台壳**：

1. **顶栏**：品牌、全局搜索框（演示占位/后续可接搜索）、时钟与指标（工作台页）、警号登录、部分页有主题切换。  
2. **左侧主导航**：指挥态势、地图中心、接警研判、研判记录、智能分析、分析报表等；当前页 `aria-current` + 高亮类。  
3. **右侧主内容区**：各模块自己的面板。

**样式逻辑**：`web/styles.css` 用 CSS 变量（如 `--cmd-bg`、`--cmd-border`、`--command-header-height`）统一暗色指挥台与对齐；多页通过相同 class 组合减少「换页壳变形」。

---

### 3.2 接警研判（`/` → `web/index.html` + `web/app.js`）

**用户操作顺序（网页逻辑）**：

1. 在「警情接入」输入报警原文（或选快速示例 / 下拉示例）。  
2. 可选勾选「检索增强」。  
3. 点击「开始研判」→ 前端 `POST /api/analyze`。  
4. 成功后：  
   - 更新「研判概要、警情要点、布控、出警简报、法律依据」等区块；  
   - 刷新历史列表 `GET /api/history`；  
   - 展开/引导用户查看「研判结果与复核」区域。  
5. 用户可：  
   - 打开「研判结果专页」链接（带 `analysis_id`）；  
   - 打开「研判记录总览」（带当前 `id` 的链接逻辑）；  
   - 点击历史条目 → `GET /api/analysis/<id>` 恢复该条到当前工作台视图；  
   - 填写复核结论并保存 → `POST /api/review`；  
   - 下载 Markdown / 复核 JSON。

**页内导航逻辑**：工作台左侧「接警研判」使用 `href="#work-overview"` 等锚点；`app.js` 里 `initWorkbenchInPageNav()` 拦截 hash 导航、滚动到对应区块，并同步侧栏高亮（避免整页刷新）。

**语音接入逻辑（可选）**：`ingestAudioFile` → 内部 `/internal/v1/uploads` 等流水线（`callInternalForm`），完成后把识别文本合并进报警框并触发研判刷新（与纯文本路径汇合到同一展示函数）。

---

### 3.3 研判记录总览（`/judgments` → `judgments.html` + `judgments.js`）

**网页逻辑**：

1. 进入页面后拉 `GET /api/history?limit=120`，左侧渲染可点击列表（时间已含年月日格式由后端统一）。  
2. 点击某条 → `GET /api/analysis-presentation/<id>`，右侧用 `ar-presentation-render.js` 渲染与专页一致的「警情事实 + AI 研判」布局。  
3. 用户可在专页组件内做「采纳/忽略」→ `POST /api/analysis-presentation/<id>/feedback`（并会同步案件状态逻辑）。  
4. URL 带 `?id=` 时：列表加载完成后自动选中并打开该条（深链）。

---

### 3.4 智能分析 / 案件管理（`/command-analysis`）

**网页逻辑**：

1. `GET /api/cases` 拉 KPI + 卡片列表（数据与研判历史同源聚合）。  
2. 卡片上可改状态下拉 → `PATCH /api/cases/<analysis_id>`。  
3. 「发起新研判」→ 跳转 `/` 进入接警研判录入。  
4. 「打开研判」→ `/judgments?id=...` 深链。

**业务含义**：案件列表不是独立造库，而是**研判记录的业务化视图** + **状态闭环**（人工 PATCH + 专页反馈 + 复核启发）。

---

### 3.5 地图中心（`/command-map`）

**网页逻辑**：

1. 浏览器加载 Flask 挂载的 `map-app` 构建页（HTML 壳与主站一致，内嵌 Vite 打包的 JS/CSS）。  
2. 选择时间范围 → `GET /api/map-events` 拉点位。  
3. 悬停/点击矢量点查看详情（含坐标来源、置信度、说明等）。  

**技术逻辑**：OpenLayers 地图视图 + 矢量图层；坐标为 WGS84 经 `fromLonLat` 投影；后端 `resolve_geo_for_map` 统一决定每条记录显示点。

---

### 3.6 其他页面（简述）

- **指挥态势**（`command-situation.html`）：演示视频区 + KPI 壳，与主壳一致。  
- **分析报表**（`performance.html`）：性能与统计展示，同源壳。  
- **技术路线**（`tech-route.html`）：文档型说明页，同源壳。  
- **研判结果专页**（`analysis-result.html`）：单条大屏展示（由工作台链接带 `id` 打开）。

---

## 四、后端逻辑：会话、快照、持久化（计划书「系统设计」）

### 4.1 会话真源（默认）

`api_server.py` 中 `SessionStore` 保存：

- `analysis_history`：列表摘要（列表页用）。  
- `analysis_by_id`：完整快照（恢复、专页、案件、地图聚合用）。  
- `review_records`、`risk_counts`、布控相关字段等。

**研判成功**时 `finalize_analysis_persistence()`：

- 组装快照（结果、markdown、布控、presentation、geo、officer_brief、disposal_nav、**case 默认**等）；  
- 写入 `analysis_by_id`；  
- 若配置 Supabase，则 upsert 一行。

### 4.2 历史列表来源优先级

`GET /api/history`：**若 Supabase 可用则读库**，否则读内存 `analysis_history` 尾部。这样计划书里可写「支持演示内存模式与可选持久化模式」。

### 4.3 案件 `case_mgmt`（可选库字段）

迁移 `003_case_mgmt.sql`：`incident_analyses.case_mgmt` 存 JSON。  
未执行迁移时：内存仍可用；远端 upsert 可能因缺列失败（需在计划书写明「部署需执行 SQL 迁移」）。

---

## 五、研判与布控的技术流水线（计划书「算法/模型应用」）

1. **Prompt**：`src/prompts.py` 定义输出 JSON schema（含 `geo` 等字段）。  
2. **调用**：`src/services/incident_service.py` → LLM → `parse_llm_json`。  
3. **后处理**：风险规则、置信度 bundle。  
4. **布控**：`workbench_service.generate_bukong_plan()` 第二次 LLM，结构化 JSON 再渲染 Markdown。  
5. **简报/处置导航**：`officer_brief.py`、`disposal_nav.py` 基于结果拼装演示数据或结构化步骤。

计划书中可强调：**可解释结构化输出 + 二次生成布控**，符合赛题「智能研判 + 辅助决策」表述。

---

## 六、地图坐标技术逻辑（计划书「空间信息处理」）

**目标**：在缺少真实地理编码服务时，仍能在地图上**稳定展示**并标明可信度。

**链路**（`resolve_geo_for_map`）：

1. 优先采用研判 JSON 中 LLM 给出的 `geo`（WGS84，`confidence` 0~1）。  
2. 否则规则解析文本经纬度、区县、地标等（`infer_geo_from_text`）。  
3. 再不行使用低置信展示兜底点（演示策略），并在接口/前端展示 `geo_source`、`geo_confidence`、`geo_notes`。

计划书需诚实写：**演示级坐标**，生产应接指挥一张图/地理编码服务并处理坐标系（如 GCJ/WGS）。

---
