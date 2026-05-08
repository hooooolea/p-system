"""
快速测试脚本 - 验证API连通性和核心功能
运行方式：python test_quick.py
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from dotenv import load_dotenv
load_dotenv()

TEST_CASES = [
    {
        "text": "喂，我在朝阳区三里屯那边，有几个人在打架，好像还有人拿刀，快来人！",
        "expected_type": "打架斗殴",
        "expected_risk": "紧急"
    },
    {
        "text": "有人给我打电话说我儿子出车祸了要我转钱，我感觉是骗子但我不确定",
        "expected_type": "诈骗",
        "expected_risk": "中"
    },
    {
        "text": "楼上装修噪音太大了，跟他们说了不听，能管管吗",
        "expected_type": "噪音扰民",
        "expected_risk": "低"
    },
]

def test_api_connection():
    """测试API是否连通"""
    print("\n" + "="*50)
    print("🔌 测试API连通性...")
    try:
        from incident_analyzer import get_llm
        from langchain_core.messages import HumanMessage
        llm = get_llm()
        resp = llm.invoke([HumanMessage(content="你好，请回复'连通成功'")])
        print(f"✅ API连通成功：{resp.content[:30]}")
        return True
    except Exception as e:
        print(f"❌ API连通失败：{e}")
        print("👉 请检查 .env 文件中的 API Key 是否正确")
        return False

def test_rag():
    """测试RAG知识库"""
    print("\n" + "="*50)
    print("📚 测试RAG知识库...")
    try:
        from rag_retriever import retrieve_procedures
        result = retrieve_procedures("打架斗殴")
        if result:
            print(f"✅ RAG检索成功，返回 {len(result)} 字符的规程内容")
        else:
            print("⚠️ RAG检索返回空结果（知识库可能为空）")
    except Exception as e:
        print(f"❌ RAG测试失败：{e}")

def test_analysis():
    """测试警情分析"""
    print("\n" + "="*50)
    print("🔍 测试警情分析（3条测试用例）...")

    from incident_analyzer import analyze_incident
    from rag_retriever import retrieve_procedures

    correct = 0
    for i, case in enumerate(TEST_CASES, 1):
        print(f"\n--- 测试用例 {i} ---")
        print(f"输入：{case['text'][:40]}...")

        rag_ctx = retrieve_procedures(case["text"])
        result = analyze_incident(case["text"], rag_ctx, use_rag=True)

        incident_ok = result.get("incident_type") == case["expected_type"]
        risk_ok = result.get("risk_level") == case["expected_risk"]

        expected_type = case["expected_type"]
        expected_risk = case["expected_risk"]
        type_status = "✅" if incident_ok else f"❌(期望{expected_type})"
        risk_status = "✅" if risk_ok else f"❌(期望{expected_risk})"

        print(f"预测类型：{result.get('incident_type')} {type_status}")
        print(f"风险等级：{result.get('risk_level')} {risk_status}")
        print(f"摘要：{result.get('summary', '')}")

        if incident_ok and risk_ok:
            correct += 1

    print(f"\n{'='*50}")
    accuracy = correct / len(TEST_CASES) * 100
    print(f"📊 准确率：{correct}/{len(TEST_CASES)} = {accuracy:.0f}%")
    if accuracy >= 80:
        print("🎉 达到题目要求（≥80%）！")
    else:
        print("⚠️ 未达标，建议优化Prompt或增加知识库内容")

if __name__ == "__main__":
    print("🚔 警擎系统 - 快速功能测试")
    print("="*50)

    # 检查环境变量
    api_key = os.getenv("ZHIPUAI_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
    if not api_key or "your_" in str(api_key):
        print("❌ 未检测到有效API Key")
        print("👉 请先复制 env.example 为 .env，并填入你的API Key")
        print("   智谱AI注册：https://open.bigmodel.cn/")
        sys.exit(1)

    # 依次执行测试
    if test_api_connection():
        test_rag()
        test_analysis()
    
    print("\n✅ 测试完成！如果全部通过，运行 python api_server.py 启动浏览器工作台")
