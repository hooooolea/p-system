# YOLO 视频链路接入（Plice）

这个目录提供一个最小可运行的 YOLO 推理上报器：  
从视频流检测人/车后，调用后端 `POST /api/video/detections`。

## 1) 安装依赖

```bash
cd /Users/ejuer/Desktop/plice/video-pipeline
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2) 启动 plice 后端

确保你的后端在 `http://127.0.0.1:8000`：

```bash
cd /Users/ejuer/Desktop/plice
python api_server.py
```

## 3) 跑 YOLO 流处理

### 本地视频文件测试

```bash
python yolo_stream_worker.py \
  --stream-url "/绝对路径/demo.mp4" \
  --backend-base "http://127.0.0.1:8000" \
  --camera-id "CAM-001" \
  --zone "东门卡口"
```

### RTSP 流测试

```bash
python yolo_stream_worker.py \
  --stream-url "rtsp://user:pass@ip:554/stream" \
  --backend-base "http://127.0.0.1:8000" \
  --camera-id "CAM-RTSP-01" \
  --zone "南门"
```

## 4) 参数说明

- `--model-path`: 默认 `yolov8n.pt`（首次运行会下载）
- `--frame-interval`: 每隔多少帧做一次推理，默认 `5`
- `--push-interval-sec`: 最小上报间隔，默认 `1.0`
- `--dry-run`: 只打印 payload，不请求后端

## 5) 与现有页面联动

上报成功后，`command-situation.html` 的：

- KPI（在线流/告警事件/活跃目标）
- 告警流水表
- SSE 实时刷新

会自动更新。

## 6) 当前能力边界

当前脚本是 **YOLO 检测 + 上报**，还不是完整 ReID 系统。  
下一步可扩展：ByteTrack（同镜跟踪）+ FastReID（跨镜ID归并）。

