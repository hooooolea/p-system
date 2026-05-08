"""
运行 50 条样本评测并输出结果文件。
用法：
  python run_eval.py
"""

import json
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from evaluation import run_evaluation


def main():
    dataset_path = os.path.join("data", "test_cases_50.json")
    if not os.path.exists(dataset_path):
        print(f"❌ 未找到测试集：{dataset_path}")
        sys.exit(1)

    with open(dataset_path, "r", encoding="utf-8") as f:
        cases = json.load(f)

    print(f"📦 载入测试集：{len(cases)} 条")
    start = time.time()
    result = run_evaluation(cases, use_rag=True, verbose=True)
    elapsed = time.time() - start

    result["elapsed_sec"] = round(elapsed, 2)
    result["avg_sec_per_case"] = round(elapsed / len(cases), 3) if cases else 0.0
    result["dataset_path"] = dataset_path

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    os.makedirs("data", exist_ok=True)
    out_path = os.path.join("data", f"eval_result_{ts}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 50)
    print(f"✅ 评测完成：{result['both_match']}/{result['cases']}")
    print(f"📊 准确率：{result['accuracy_pct']:.1f}%")
    print(f"⏱️ 总耗时：{result['elapsed_sec']}s")
    print(f"⚡ 平均单条：{result['avg_sec_per_case']}s")
    print(f"📝 结果文件：{out_path}")


if __name__ == "__main__":
    main()
