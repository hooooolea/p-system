#!/usr/bin/env python3
"""
一键生成答辩用图表：
1) 财务图（固定数据，来自计划书）
2) 可选实时图（从 /api/performance 与 /api/evaluation/alerts 拉取）

用法：
  python scripts/make_charts.py
  python scripts/make_charts.py --api-origin http://127.0.0.1:8000
  python scripts/make_charts.py --api-origin https://xxx.trycloudflare.com --timeout 8
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


YEARS = ["2026", "2027", "2028", "2029"]

# 计划书（政府口径）数据
FIN_REVENUE = {
    "政府采购收入": [212.8, 499.2, 1546.5, 2528.4],
    "运维与升级服务收入": [82.9, 216.8, 776.3, 1268.9],
    "行业协同技术服务收入": [31.8, 79.5, 257.2, 422.7],
}
FIN_TOTAL_REVENUE = [327.5, 795.5, 2580.0, 4220.0]
FIN_TOTAL_EXPENSE = [251.2, 455.1, 1229.0, 2219.0]
FIN_NET_PROFIT = [-32.6, 55.5, 369.7, 432.4]

FUNDS_SOURCE = {
    "政府专项扶持": 120,
    "公安信息化经费": 90,
    "中国移动联合支持": 60,
    "高校科研配套": 30,
}
FUNDS_USAGE = {
    "核心算法研发": 90,
    "算力与服务器": 70,
    "数据治理与知识库": 50,
    "试点部署实施": 45,
    "安全合规测试": 25,
    "项目管理与运维": 20,
}


def ensure_out_dir() -> Path:
    out = Path("charts")
    out.mkdir(parents=True, exist_ok=True)
    return out


def setup_font():
    # 常见中文字体回退
    plt.rcParams["font.sans-serif"] = [
        "PingFang SC",
        "Hiragino Sans GB",
        "Microsoft YaHei",
        "SimHei",
        "Noto Sans CJK SC",
        "Arial Unicode MS",
        "DejaVu Sans",
    ]
    plt.rcParams["axes.unicode_minus"] = False


def save_fig(path: Path):
    plt.tight_layout()
    plt.savefig(path, dpi=180, bbox_inches="tight")
    plt.close()
    print(f"[OK] {path}")


def chart_revenue_stack(out_dir: Path):
    plt.figure(figsize=(9, 5))
    bottom = [0.0] * len(YEARS)
    for name, vals in FIN_REVENUE.items():
        plt.bar(YEARS, vals, bottom=bottom, label=name)
        bottom = [b + v for b, v in zip(bottom, vals)]
    plt.title("收益构成（2026-2029）")
    plt.ylabel("万元")
    plt.legend()
    save_fig(out_dir / "01_收益构成_堆叠柱状图.png")


def chart_income_cost_profit(out_dir: Path):
    plt.figure(figsize=(9, 5))
    plt.plot(YEARS, FIN_TOTAL_REVENUE, marker="o", label="总收入")
    plt.plot(YEARS, FIN_TOTAL_EXPENSE, marker="o", label="费用总额")
    plt.plot(YEARS, FIN_NET_PROFIT, marker="o", label="净利润")
    plt.axhline(0, color="#999999", linewidth=1)
    plt.title("收入-费用-净利润趋势")
    plt.ylabel("万元")
    plt.legend()
    save_fig(out_dir / "02_收入费用净利润_折线图.png")


def chart_funds_source_pie(out_dir: Path):
    plt.figure(figsize=(7, 7))
    labels = list(FUNDS_SOURCE.keys())
    values = list(FUNDS_SOURCE.values())
    plt.pie(values, labels=labels, autopct="%1.0f%%", startangle=100)
    plt.title("资金来源占比")
    save_fig(out_dir / "03_资金来源_饼图.png")


def chart_funds_usage_bar(out_dir: Path):
    plt.figure(figsize=(10, 5))
    labels = list(FUNDS_USAGE.keys())
    values = list(FUNDS_USAGE.values())
    plt.bar(labels, values)
    plt.title("资金用途分布")
    plt.ylabel("万元")
    plt.xticks(rotation=20, ha="right")
    save_fig(out_dir / "04_资金用途_柱状图.png")


def fetch_json(url: str, timeout: int):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read().decode("utf-8")
        return json.loads(data)


def chart_eval_metrics(eval_data: dict, out_dir: Path):
    m = (eval_data or {}).get("metrics") or {}
    labels = ["precision", "false_alarm_rate", "recall_proxy", "f1_proxy"]
    vals = [float(m.get(k, 0.0) or 0.0) for k in labels]
    plt.figure(figsize=(8, 5))
    plt.bar(labels, vals)
    plt.ylim(0, 1)
    plt.title("预警评测指标（实时）")
    plt.ylabel("值（0~1）")
    save_fig(out_dir / "05_预警评测指标_柱状图.png")


def chart_risk_counts(perf_data: dict, out_dir: Path):
    rc = (perf_data or {}).get("risk_counts") or {}
    labels = ["紧急", "高", "中", "低"]
    vals = [int(rc.get(k, 0) or 0) for k in labels]
    plt.figure(figsize=(8, 5))
    plt.bar(labels, vals)
    plt.title("风险等级分布（实时）")
    plt.ylabel("条数")
    save_fig(out_dir / "06_风险等级分布_柱状图.png")


def chart_elapsed_trend(perf_data: dict, out_dir: Path):
    trend = (perf_data or {}).get("elapsed_trend") or []
    xs = [str(row.get("序号", i + 1)) for i, row in enumerate(trend)]
    ys = []
    for row in trend:
        try:
            ys.append(float(row.get("耗时(秒)", 0) or 0))
        except (TypeError, ValueError):
            ys.append(0.0)
    if not ys:
        return
    plt.figure(figsize=(9, 5))
    plt.plot(xs, ys, marker="o")
    plt.title("最近样本耗时趋势（实时）")
    plt.ylabel("秒")
    plt.xlabel("序号")
    save_fig(out_dir / "07_耗时趋势_折线图.png")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-origin", default="", help="例如 http://127.0.0.1:8000 或 https://xxx.trycloudflare.com")
    parser.add_argument("--timeout", type=int, default=6)
    args = parser.parse_args()

    setup_font()
    out_dir = ensure_out_dir()

    # 固定财务图
    chart_revenue_stack(out_dir)
    chart_income_cost_profit(out_dir)
    chart_funds_source_pie(out_dir)
    chart_funds_usage_bar(out_dir)

    # 可选实时图
    api_origin = args.api_origin.strip().rstrip("/")
    if not api_origin:
        print("[INFO] 未传 --api-origin，跳过实时接口图。")
        return

    try:
        perf_data = fetch_json(f"{api_origin}/api/performance", timeout=args.timeout)
        chart_risk_counts(perf_data, out_dir)
        chart_elapsed_trend(perf_data, out_dir)
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"[WARN] 拉取 /api/performance 失败：{e}")

    try:
        eval_data = fetch_json(f"{api_origin}/api/evaluation/alerts", timeout=args.timeout)
        chart_eval_metrics(eval_data, out_dir)
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"[WARN] 拉取 /api/evaluation/alerts 失败：{e}")


if __name__ == "__main__":
    main()
