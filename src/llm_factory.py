"""根据环境变量创建 Chat 模型实例。"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def get_llm():
    """根据环境变量返回对应的 LLM 实例。"""
    provider = os.getenv("LLM_PROVIDER", "zhipuai")

    if provider == "zhipuai":
        from langchain_community.chat_models import ChatZhipuAI

        return ChatZhipuAI(
            model="glm-4-flash",
            api_key=os.getenv("ZHIPUAI_API_KEY"),
            temperature=0.1,
        )
    if provider == "dashscope":
        from langchain_community.chat_models import ChatTongyi

        return ChatTongyi(
            model_name="qwen-long",
            dashscope_api_key=os.getenv("DASHSCOPE_API_KEY"),
            temperature=0.1,
        )
    if provider == "minimax":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model="MiniMax-M2.7-highspeed",
            openai_api_key=os.getenv("MINIMAX_API_KEY"),
            openai_api_base="https://api.minimax.chat/v1",
            temperature=0.1,
        )
    raise ValueError(f"不支持的LLM提供商: {provider}")
