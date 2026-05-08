# 模块职责与技术栈说明

## 用白话讲：整体上实现了什么

这是一套**智慧警务接警研判**的演示系统，核心能力是：你把**报警描述**（文字、或上传语音后转成的文字、或经内部管线写入的摘要）交给系统，系统用**大模型**结合**可选的知识库检索（RAG）**，自动给出**警情类型、风险等级、关键信息、处置建议**等结构化结果，并支持**布控方案草稿**、**人工复核记录**、**简单绩效统计**。

对外主界面是 **浏览器单页**（`web/index.html` + `web/app.js`，由 `api_server.py` 托管）：**语音接警**走 `multipart` 上传与 **`/internal/v1`**（ASR、Canonical 警情合并等）；**文字接警**走同源 `/api/analyze`。后端仍保留 **110 / 视频等 Adapter 与内部 REST**（见 `PRIVATE_NETWORK_ADAPTER_SPEC.md`），但首页已不再单独开「多源接入」Tab，避免与现网 DOM 不一致的文档描述。另有一套可选的 **Vite + React** 子工程（`app/`），与主流程并行，需单独构建接入。

说白了：**前面是接警与接入（语音上传 + 内部编排）**，**中间是 LLM + 可选向量库做研判与布控**，**后面是复核与性能/评审维度看板**；下面按目录拆开说明。

---

本文按代码目录/文件粒度列出「实现了什么」与「主要技术栈」，便于交接与答辩时对照。

---

## 1. 总览

| 层级 | 作用 | 技术栈 |
|------|------|--------|
| **HTML 工作台** | 单页实战 / 证据 / 性能（评审维度并入 performance） | 原生 HTML + CSS + JavaScript，**Flask** 提供 `/` 与 `/api/*` |
| **内部专网 API** | Canonical 警情接入、上传、ASR、研判编排 | **Flask Blueprint**，`multipart/form-data`，内存仓储与后台线程 |
| **研判与 RAG** | LLM 结构化输出、规程检索 | **LangChain**（Core / Community / OpenAI 生态）、**Chroma**、**智谱 / 通义** 等 Chat 模型 |
| **独立 SPA（可选）** | `app/` 下现代前端工程，与主仓库并行存在 | **Vite** + **React** + **TypeScript** + **Tailwind** + **Radix UI** |

Python 依赖以仓库根目录 `requirements.txt` 为准；Node 依赖以 `app/package.json` 为准。

---

## 2. 入口与 Web 服务

### `api_server.py`

- **实现**：Flask 应用入口；托管静态目录 `web/`；`GET /` 工作台；`/api/*` 研判/历史/复核/布控/绩效（`GET /api/performance` 内含 `scorecard`）等 JSON；注册内部蓝图 `/internal/v1`；`GET /uploads/<fname>` 安全下发本地上传文件。
- **技术栈**：Flask 3.x；与 `services.workbench_service` 复用同一套研判与会话存储逻辑。

---

## 3. 静态前端 `web/`

| 文件 | 实现 | 技术栈 |
|------|------|--------|
| `index.html` | 单页工作台：三标签（实战 / 证据与可解释 / 性能与成效） | HTML5 |
| `app.js` | 标签切换、内部 API（Bearer）、语音上传与轮询、研判、复核、布控、性能与评审维度表等 | 原生 JavaScript（Fetch、DOM） |
| `styles.css` | 全局与组件样式 | CSS3 |

---

## 4. 内部 API 与适配器 `src/adapters/`

### `http/blueprint.py`

- **实现**：`/internal/v1` 下全部路由：健康检查、CAD110/视频告警 ingest、patch/merge、警情列表与详情、知识库与历史相似、ASR 任务创建/查询/挂接、上传 `multipart`、同步/异步研判、`media-jobs` 查询等；可选 `INTERNAL_API_TOKEN` 鉴权。
- **技术栈**：Flask Blueprint、`werkzeug` 文件上传、环境变量配置。

### `ingest/service.py`

- **实现**：接入编排核心：`ensure_incident_for_media`、CAD110/视频 ingest、按警情号合并、`patch_incident`、`list_incidents` 等。
- **技术栈**：纯 Python；依赖 `canonical` 合并策略与各 mapper。

### `ingest/repository.py`

- **实现**：Canonical 警情的**内存** CRUD、按 `alarm_no` 查找、幂等键存储。
- **技术栈**：标准库 `dict` / `copy`（可替换为数据库实现）。

### `ingest/media_upload.py`

- **实现**：上传文件类型与大小校验、落盘文件名生成、`attachments` 条目构造。
- **技术栈**：`pathlib`、`uuid`、`werkzeug.FileStorage`；白名单扩展名。

### `ingest/post_upload_pipeline.py`

- **实现**：上传后的后台线程流水线：语音走 ASR 并回写 `asr_text`；视频依赖上传阶段已写的 `visual`；可选触发异步研判。
- **技术栈**：`threading`、轮询 ASR 任务状态；Flask `app_context`。

### `ingest/async_analyze.py`

- **实现**：从 HTTP 与上传流水线共用的「异步研判」线程：读库取 `canonical_alarm_text`、调用研判、写回 `_latest_analysis` 与分析任务状态。
- **技术栈**：`threading`；复用 `services.workbench_service`。

### `asr/client.py`

- **实现**：默认 **`ASR_BACKEND=modelscope`**：按 `asr/说明.md` 使用 **ModelScope `pipeline(Tasks.auto_speech_recognition, …)`** 加载 Paraformer-large+VAD+PUNC；`create_job` 在后台线程读本地 wav（解析 `/uploads/<file>` → `data/uploads`）并推理；`ASR_BACKEND=mock` 时为占位转写。环境变量：`ASR_MODEL_ID`、`ASR_MODEL_REVISION`、`ASR_LOCAL_DIR`（本地已下载目录）、`ASR_UPLOAD_ROOT`。
- **技术栈**：**ModelScope** + **PyTorch**（需自行安装 torch）；`threading`、`uuid`。

### `cad110/mapper.py`

- **实现**：专网/模拟 CAD110 载荷 → Canonical patch 字段映射。
- **技术栈**：纯 Python 字典变换。

### `video/mapper.py`

- **实现**：视频告警载荷 → Canonical patch（含关联警情号等）。
- **技术栈**：纯 Python。

### `knowledge/client.py`

- **实现**：内部 API 使用的知识检索抽象（演示/内置数据）。
- **技术栈**：Python（可与 RAG 模块对齐或独立实现）。

### `history/client.py`

- **实现**：历史警情相似检索等内部 API 能力（演示/种子数据）。
- **技术栈**：Python。

### `common/canonical.py`

- **实现**：Canonical 壳结构、`merge_policy_apply`、`recompute_ingest_status`、`canonical_alarm_text`、payload 哈希等核心模型逻辑。
- **技术栈**：标准库 `json` / `hashlib` / `uuid` / `copy`。

### `common/errors.py` / `logging_audit.py` / `redact.py`

- **实现**：统一 API 错误结构、审计日志事件、脱敏等横切能力。
- **技术栈**：Python。

### `common/http_client.py`

- **实现**：专网 HTTP 客户端占位说明（mTLS/超时等见规格文档）。
- **技术栈**：注释级占位；未来可用 httpx/urllib3。

### `adapters/__init__.py` 与各包 `__init__.py`

- **实现**：包导出与对外 API 收敛。
- **技术栈**：Python 包结构。

---

## 5. 研判、RAG 与 LLM `src/`（非 adapters 部分）

| 模块 | 实现 | 技术栈 |
|------|------|--------|
| `services/workbench_service.py` | 会话状态默认值、单次研判入口 `analyze_alarm`、RAG 规程拼接、布控 Prompt 与 JSON 解析、复核记录、绩效统计、Markdown 组装等 | Python；**langchain_core.messages**；调用 `incident_analyzer` / `rag_retriever` |
| `services/incident_service.py` | 单条警情：拼装 Prompt、调用 LLM、JSON 解析与风险后处理 | **LangChain Chat**；`llm_factory`；`prompts`；`schemas`；`utils` |
| `incident_analyzer.py` | 兼容层：转发 `analyze_incident` 等，保持旧 import 路径可用 | Python 再导出 |
| `rag_retriever.py` | 内置警务规程片段、构建/加载 **Chroma** 向量库、按查询检索规程文本 | **langchain-chroma** 或 **langchain_community.vectorstores.Chroma**；**python-dotenv** |
| `retriever.py` | RAG 检索统一入口，再导出 `rag_retriever` 函数 | Python |
| `llm_factory.py` | 按 `LLM_PROVIDER` 创建 **ChatZhipuAI** 或 **ChatTongyi** | **langchain_community**；环境变量 |
| `prompts.py` | 研判等 Prompt 模板 | Python 字符串 |
| `schemas.py` | Pydantic 模型（警情类型、风险等级、结构化输出约束等） | **Pydantic v2** |
| `evaluation.py` / `run_eval.py` | 评测相关逻辑与入口脚本 | Python（按需） |
| `utils/json_utils.py` | LLM 输出 JSON 容错解析 | Python `json` / 正则等 |
| `utils/risk_rules.py` | 风险等级等规则后处理 | Python |

---

## 6. 独立前端子工程 `app/`（可选）

- **实现**：与根目录 `web/` 并行的 **Vite + React** 工程（含 `src/` 下 TSX、Radix 组件、Tailwind 配置等）；`dist/` 为构建产物。
- **技术栈**：**Vite**、**React**、**TypeScript**、**Tailwind CSS**、**Radix UI**、**ESLint** 等（详见 `app/package.json`）。

> 主流程演示以根目录 `web/` + `api_server.py` 为主；`app/` 子工程是否接入部署需单独配置。

---

## 7. 脚本与测试

| 文件 | 实现 | 技术栈 |
|------|------|--------|
| `test_quick.py` | 快速冒烟/联调测试 | Python |
| `run_eval.py` | 评测运行入口 | Python |

---

## 8. 文档 `docs-md/`

- **实现**：需求、任务、进度、前端架构、专网 Adapter 规格等 Markdown 文档；**不包含运行时逻辑**。
- **技术栈**：Markdown。

---

## 9. 数据与配置（非代码模块，常一起说明）

| 项 | 说明 |
|----|------|
| `data/uploads/` | 本地上传媒体落盘目录（由 `api_server` 配置 `UPLOAD_FOLDER`） |
| `.env` / `env.example` | LLM Key、Chroma 路径、内部 Token 等 |
| `chroma_db/` | 向量库持久化目录（默认路径可由环境变量指定） |

---

*文档生成依据仓库当前结构；若新增模块，请在本文件中追加一行并保持「实现 / 技术栈」两列格式一致。*
