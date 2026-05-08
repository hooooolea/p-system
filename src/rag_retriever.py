"""
RAG 知识库模块
功能：加载警务处置规程文档，构建向量数据库，按警情类型检索相关规程
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")


def _get_chroma_class():
    """
    优先使用 langchain-chroma（新实现），避免社区版 Chroma 的弃用告警。
    """
    try:
        from langchain_chroma import Chroma  # type: ignore
        return Chroma
    except ImportError:
        from langchain_community.vectorstores import Chroma
        return Chroma

# ── 内置基础知识库（无需额外文件即可运行）───────────────────────
BUILTIN_KNOWLEDGE = [
    {
        "id": "proc_fight_001",
        "category": "打架斗殴",
        "title": "群体性打架斗殴处置规程",
        "content": """
处置要点：
1. 立即出警，3人以上警力，配备防护装备
2. 优先控制现场，分离双方，防止事态升级
3. 有人受伤立即通知120并记录伤情
4. 收集目击者信息，固定现场证据
5. 涉及武器者，按刑事案件处理，通知刑侦部门

法律依据：《治安管理处罚法》第26条（聚众斗殴）
情节严重者：《刑法》第292条，最高刑期10年
风险提示：注意自身安全，群体性事件须请求增援
        """.strip(),
        "keywords": ["打架", "斗殴", "群殴", "冲突", "厮打"]
    },
    {
        "id": "proc_theft_001",
        "category": "盗窃抢劫",
        "title": "盗窃抢劫案件处置规程",
        "content": """
处置要点：
1. 立即出警，了解犯罪嫌疑人特征、逃跑方向
2. 抢劫案件优先级高，须立即追缉并通报周边警力
3. 保护现场，提取指纹、监控等物证
4. 询问被害人，制作笔录，评估损失
5. 盗窃金额超2000元（各地标准不同）立案侦查

法律依据：盗窃《刑法》第264条；抢劫《刑法》第263条
抢劫最低刑期3年，情节严重10年以上
风险提示：持械抢劫须谨慎接触，优先保障人员安全
        """.strip(),
        "keywords": ["盗窃", "抢劫", "偷", "抢", "扒窃", "入室"]
    },
    {
        "id": "proc_domestic_001",
        "category": "家庭纠纷",
        "title": "家庭纠纷及家暴处置规程",
        "content": """
处置要点：
1. 2名以上警力出警，男女搭配为佳
2. 到场后分开询问双方当事人，避免激化
3. 发现家暴迹象：拍照记录伤情，询问是否需要庇护
4. 家暴受害者可申请《人身安全保护令》，告知权利
5. 有未成年人在场须优先保障其安全

法律依据：《反家庭暴力法》；《治安管理处罚法》第43条
注意：家庭纠纷不等于家暴，需准确甄别
风险提示：防止调解过程中当事人情绪失控伤人
        """.strip(),
        "keywords": ["家暴", "家庭纠纷", "夫妻", "家庭矛盾", "打老婆", "打丈夫"]
    },
    {
        "id": "proc_fraud_001",
        "category": "诈骗",
        "title": "电信网络诈骗处置规程",
        "content": """
处置要点：
1. 立即告知受害人停止转账，第一时间拨打96110
2. 协助受害人向银行申请紧急止付，黄金时间72小时
3. 收集聊天记录、转账凭证、对方账号等证据
4. 登录"国家反诈中心"APP报案备案
5. 通报反诈专项部门接手后续侦查

法律依据：《刑法》第266条，诈骗罪，3年以上10年以下
电信诈骗按《电信网络诈骗治理条例》加重处罚
风险提示：注意受害人情绪，防止极端行为
        """.strip(),
        "keywords": ["诈骗", "被骗", "转账", "电话骗", "网络诈骗", "假冒"]
    },
    {
        "id": "proc_traffic_001",
        "category": "交通事故",
        "title": "道路交通事故处置规程",
        "content": """
处置要点：
1. 优先确认是否有人员伤亡，伤亡者立即通知120
2. 设置警戒线，保护现场，疏导交通
3. 拍照记录现场（车辆位置、损伤情况、路面痕迹）
4. 收集当事人驾驶证、行驶证，检测是否饮酒/毒驾
5. 轻微事故引导双方协商，重大事故通知交通事故处理部门

法律依据：《道路交通安全法》第70条
饮酒驾车：《刑法》第133条之一，危险驾驶罪
风险提示：二次事故风险高，务必做好现场隔离
        """.strip(),
        "keywords": ["交通事故", "车祸", "追尾", "撞车", "肇事", "醉驾"]
    },
    {
        "id": "proc_missing_001",
        "category": "失踪人口",
        "title": "失踪人口及走失老人儿童处置规程",
        "content": """
处置要点：
1. 儿童失踪：立即启动"黄色预警"，无需等待24小时
2. 老人走失（疑似认知症）：发布协查通报，联系养老机构
3. 收集失踪人员照片、最后出现地点、穿着描述
4. 调阅周边监控，确定行动轨迹
5. 通过"团圆"系统（公安部儿童失踪信息平台）发布信息

注意：未成年人失踪无需等待任何时间，立即处理
风险提示：排查自杀、拐卖等可能，做最坏预案
        """.strip(),
        "keywords": ["失踪", "走失", "找人", "孩子不见了", "老人走丢"]
    },
]

# ── 向量数据库操作 ─────────────────────────────────────────────
def _get_embedding_function():
    """返回embedding函数（使用智谱AI或本地简单方案）"""
    provider = os.getenv("LLM_PROVIDER", "zhipuai")
    
    if provider == "zhipuai":
        from langchain_community.embeddings import ZhipuAIEmbeddings
        return ZhipuAIEmbeddings(
            model="embedding-3",
            api_key=os.getenv("ZHIPUAI_API_KEY"),
        )
    else:
        # 降级方案：使用轻量级本地embedding
        from langchain_community.embeddings import HuggingFaceEmbeddings
        return HuggingFaceEmbeddings(
            model_name="shibing624/text2vec-base-chinese"
        )


def build_knowledge_base(extra_docs: list = None):
    """
    构建向量知识库
    
    Args:
        extra_docs: 额外文档列表，每项为 {"title": str, "content": str, "category": str}
    """
    Chroma = _get_chroma_class()
    # LangChain v0.2+ 中 Document 位于 langchain_core.documents
    from langchain_core.documents import Document

    print("📚 正在构建警务知识库...")

    # 合并内置知识库和额外文档
    all_docs = list(BUILTIN_KNOWLEDGE)
    if extra_docs:
        all_docs.extend(extra_docs)

    # 转换为 LangChain Document 格式
    documents = []
    for item in all_docs:
        doc = Document(
            page_content=f"【{item.get('category', '通用')}】{item.get('title', '')}\n\n{item['content']}",
            metadata={
                "id": item.get("id", ""),
                "category": item.get("category", "通用"),
                "title": item.get("title", ""),
                "keywords": ",".join(item.get("keywords", [])),
            }
        )
        documents.append(doc)

    embedding_fn = _get_embedding_function()
    
    vectorstore = Chroma.from_documents(
        documents=documents,
        embedding=embedding_fn,
        persist_directory=CHROMA_DB_PATH,
        collection_name="police_procedures"
    )
    
    print(f"✅ 知识库构建完成，共载入 {len(documents)} 条规程")
    return vectorstore


def get_knowledge_base():
    """加载已有知识库，不存在则自动构建"""
    Chroma = _get_chroma_class()
    
    db_exists = Path(CHROMA_DB_PATH).exists()
    embedding_fn = _get_embedding_function()
    
    if db_exists:
        vectorstore = Chroma(
            persist_directory=CHROMA_DB_PATH,
            embedding_function=embedding_fn,
            collection_name="police_procedures"
        )
    else:
        vectorstore = build_knowledge_base()
    
    return vectorstore


def retrieve_procedures(query: str, k: int = 2) -> str:
    """
    检索相关处置规程
    
    Args:
        query: 查询文本（通常是报警内容或警情类型）
        k: 返回最相关的k条规程
    
    Returns:
        拼接好的规程文本，用于注入Prompt
    """
    try:
        vectorstore = get_knowledge_base()
        results = vectorstore.similarity_search(query, k=k)
        
        if not results:
            return ""
        
        context_parts = []
        for i, doc in enumerate(results, 1):
            context_parts.append(f"【参考规程{i}】\n{doc.page_content}")
        
        return "\n\n".join(context_parts)
    
    except Exception as e:
        print(f"⚠️ 知识库检索失败: {e}")
        return ""
