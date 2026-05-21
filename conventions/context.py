"""
conventions/context.py - 规范文档上下文状态 + 检索接口

独立模块，存放已加载的规范文档内容。
agent.py 和 tools 都可以从这里读取，避免循环导入。

预留 RAG 接口：当前实现为直接返回全文，未来可替换为向量检索。
"""
from typing import Protocol, Optional
import os

_loaded_conventions: str = ""
_retriever_instance: Optional["Retriever"] = None


# ========== 检索接口抽象 ==========

class Retriever(Protocol):
    """
    检索接口协议。

    当前实现：SimpleRetriever（直接返回全文）
    未来实现：RAGRetriever（向量检索）
    """

    def retrieve(self, query: str, context: dict) -> list[str]:
        """
        检索相关内容。

        参数:
            query: 检索查询（用户消息或资产特征）
            context: 上下文信息（如资产类型、当前阶段等）

        返回:
            相关文档片段列表
        """
        ...


class SimpleRetriever:
    """
    简单检索器：直接返回已加载的规范文档全文。

    当前默认实现，不引入额外依赖。
    """

    def retrieve(self, query: str, context: dict) -> list[str]:
        """返回规范文档全文（如果有）"""
        if _loaded_conventions:
            return [_loaded_conventions]
        return []


class RAGRetriever:
    """
    RAG 检索器：基于向量数据库的语义检索。

    未来实现，需要：
    1. pip install chromadb langchain openai
    2. 初始化时传入已索引的 collection
    3. 实现文档分块 + embedding 逻辑

    示例用法：
        import chromadb
        client = chromadb.PersistentClient(path="./chroma_db")
        collection = client.get_collection("conventions")
        retriever = RAGRetriever(collection)
        set_retriever(retriever)
    """

    def __init__(self, collection=None, top_k: int = 5):
        """
        初始化 RAG 检索器。

        参数:
            collection: 向量数据库集合（chromadb Collection）
            top_k: 检索返回的文档数量
        """
        self.collection = collection
        self.top_k = top_k

    def retrieve(self, query: str, context: dict) -> list[str]:
        """
        向量检索相关文档片段。

        如果 collection 未初始化，退化为返回全文。
        """
        if self.collection is None:
            # 退化处理：返回全文
            if _loaded_conventions:
                return [_loaded_conventions]
            return []

        try:
            # 构建查询（可结合 context 优化）
            search_query = self._build_query(query, context)

            # 向量检索
            results = self.collection.query(
                query_texts=[search_query],
                n_results=self.top_k
            )

            return results.get("documents", [[]])[0]
        except Exception as e:
            # 检索失败时退化
            print(f"RAG 检索失败: {e}，退化返回全文")
            if _loaded_conventions:
                return [_loaded_conventions]
            return []

    def _build_query(self, query: str, context: dict) -> str:
        """
        构建检索查询。

        可根据上下文优化查询，例如：
        - 如果 context["asset_type"] == "character"，添加角色相关关键词
        - 如果 context["stage"] == "review"，添加审核相关关键词
        """
        # 当前简单实现：直接使用原始查询
        # 未来可根据 context 扩展
        return query


# ========== 检索器管理 ==========

def get_retriever() -> Retriever:
    """获取当前检索器实例"""
    global _retriever_instance
    if _retriever_instance is None:
        # 默认使用简单检索器
        _retriever_instance = SimpleRetriever()
    return _retriever_instance


def set_retriever(retriever: Retriever):
    """
    设置检索器实例。

    用于切换检索实现：
    - set_retriever(SimpleRetriever())  # 当前默认
    - set_retriever(RAGRetriever(collection))  # 未来 RAG
    """
    global _retriever_instance
    _retriever_instance = retriever


# ========== 规范文档上下文管理（保持兼容） ==========

def get_conventions_context() -> str:
    """获取已加载的规范文档上下文（全文）"""
    return _loaded_conventions


def set_conventions_context(context: str):
    """设置规范文档上下文"""
    global _loaded_conventions
    _loaded_conventions = context


# ========== 检索接口（推荐使用） ==========

def retrieve_conventions(query: str, context: dict = None) -> list[str]:
    """
    检索相关规范文档片段。

    这是推荐的接口，未来切换 RAG 时无需修改调用方。

    参数:
        query: 检索查询（用户消息或资产特征描述）
        context: 上下文信息（可选）
            - asset_type: 资产类型（character/weapon/prop...）
            - stage: 当前阶段（analyze/review/intake）
            - project: 项目名称

    返回:
        相关文档片段列表

    示例:
        # 当前：返回全文
        docs = retrieve_conventions("检查角色面数")

        # 未来 RAG：返回相关片段
        docs = retrieve_conventions(
            "检查角色面数",
            context={"asset_type": "character", "stage": "analyze"}
        )
    """
    if context is None:
        context = {}
    retriever = get_retriever()
    return retriever.retrieve(query, context)
