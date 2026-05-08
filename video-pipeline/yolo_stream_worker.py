#!/usr/bin/env python3
"""YOLO 视频检测 -> 上报到 plice /api/video/detections."""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from typing import Any

import requests

try:
    import cv2  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise SystemExit("缺少 opencv-python，请先安装 requirements.txt") from exc

try:
    from ultralytics import YOLO  # type: ignore
except ImportError as exc:  # pragma: no cover
    raise SystemExit("缺少 ultralytics，请先安装 requirements.txt") from exc


COCO_PERSON = 0
COCO_CAR = 2
COCO_MOTORBIKE = 3
COCO_BUS = 5
COCO_TRUCK = 7
ALLOWED_CLASS_IDS = {COCO_PERSON, COCO_CAR, COCO_MOTORBIKE, COCO_BUS, COCO_TRUCK}


@dataclass
class Config:
    stream_url: str
    backend_base: str
    camera_id: str
    zone: str
    model_path: str
    conf: float
    iou: float
    frame_interval: int
    push_interval_sec: float
    dry_run: bool


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="YOLO stream worker for plice")
    p.add_argument("--stream-url", required=True, help="RTSP/HTTP/本地视频文件路径")
    p.add_argument("--backend-base", default="http://127.0.0.1:8000", help="plice 后端根地址")
    p.add_argument("--camera-id", default="CAM-001", help="摄像头编号")
    p.add_argument("--zone", default="未知区域", help="摄像头区域")
    p.add_argument("--model-path", default="yolov8n.pt", help="YOLO 模型路径或模型名")
    p.add_argument("--conf", type=float, default=0.35, help="置信度阈值")
    p.add_argument("--iou", type=float, default=0.5, help="NMS IOU 阈值")
    p.add_argument("--frame-interval", type=int, default=5, help="每隔 N 帧推理一次")
    p.add_argument("--push-interval-sec", type=float, default=1.0, help="最小上报间隔（秒）")
    p.add_argument("--dry-run", action="store_true", help="只打印不请求后端")
    return p


def traits_from_det(cls_id: int, conf: float) -> str:
    if cls_id == COCO_PERSON:
        return f"person 检测 置信度{conf:.2f}"
    if cls_id in (COCO_CAR, COCO_TRUCK, COCO_BUS):
        return f"vehicle 检测 置信度{conf:.2f}"
    if cls_id == COCO_MOTORBIKE:
        return f"motorbike 检测 置信度{conf:.2f}"
    return f"class_{cls_id} 置信度{conf:.2f}"


def push_detections(cfg: Config, detections: list[dict[str, Any]]) -> None:
    payload = {
        "camera_id": cfg.camera_id,
        "zone": cfg.zone,
        "stream_url": cfg.stream_url,
        "detections": detections,
    }
    if cfg.dry_run:
        print("[dry-run] payload:", json.dumps(payload, ensure_ascii=False))
        return
    url = f"{cfg.backend_base.rstrip('/')}/api/video/detections"
    r = requests.post(url, json=payload, timeout=8)
    if r.status_code >= 300:
        raise RuntimeError(f"上报失败: {r.status_code} {r.text[:300]}")
    body = r.json()
    print(f"[push] accepted={body.get('accepted')} camera={cfg.camera_id}")


def run(cfg: Config) -> None:
    print(f"[init] loading model: {cfg.model_path}")
    model = YOLO(cfg.model_path)
    cap = cv2.VideoCapture(cfg.stream_url)
    if not cap.isOpened():
        raise RuntimeError(f"无法打开视频流: {cfg.stream_url}")

    frame_idx = 0
    last_push_ts = 0.0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("[warn] read frame failed, retry in 1s")
                time.sleep(1.0)
                cap.release()
                cap = cv2.VideoCapture(cfg.stream_url)
                continue

            frame_idx += 1
            if frame_idx % max(1, cfg.frame_interval) != 0:
                continue

            results = model.predict(source=frame, conf=cfg.conf, iou=cfg.iou, verbose=False)
            dets: list[dict[str, Any]] = []
            for res in results:
                boxes = getattr(res, "boxes", None)
                if boxes is None:
                    continue
                for b in boxes:
                    cls_id = int(b.cls.item())
                    if cls_id not in ALLOWED_CLASS_IDS:
                        continue
                    score = float(b.conf.item())
                    label = "person" if cls_id == COCO_PERSON else "vehicle"
                    dets.append(
                        {
                            "label": label,
                            "score": round(score, 4),
                            "traits": traits_from_det(cls_id, score),
                        }
                    )

            now = time.time()
            if dets and (now - last_push_ts) >= max(0.1, cfg.push_interval_sec):
                push_detections(cfg, dets[:20])
                last_push_ts = now
    finally:
        cap.release()


def main() -> None:
    args = build_parser().parse_args()
    cfg = Config(
        stream_url=args.stream_url,
        backend_base=args.backend_base,
        camera_id=args.camera_id,
        zone=args.zone,
        model_path=args.model_path,
        conf=args.conf,
        iou=args.iou,
        frame_interval=args.frame_interval,
        push_interval_sec=args.push_interval_sec,
        dry_run=bool(args.dry_run),
    )
    run(cfg)


if __name__ == "__main__":
    main()

