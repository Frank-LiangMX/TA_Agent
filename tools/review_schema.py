"""
tools/review_schema.py - 审核工具 Schema 定义

定义审核工作流相关的 LLM Function Calling Schema
"""

GET_PENDING_REVIEWS_DEF = {
    "type": "function",
    "function": {
        "name": "get_pending_reviews",
        "description": "获取待审核的资产列表，按置信度分组。高置信度可批量通过，低置信度需逐个确认。默认过滤掉动画文件。",
        "parameters": {
            "type": "object",
            "properties": {
                "confidence_threshold": {
                    "type": "number",
                    "description": "置信度阈值，高于此值为高置信度（默认 0.9）",
                    "default": 0.9,
                },
                "include_animation": {
                    "type": "boolean",
                    "description": "是否包含动画文件（默认 false，动画不需要审核）",
                    "default": False,
                },
                "store_dir": {
                    "type": "string",
                    "description": "标签数据库目录路径",
                },
            },
            "required": ["store_dir"],
        },
    },
}

GET_REVIEW_DETAIL_DEF = {
    "type": "function",
    "function": {
        "name": "get_review_detail",
        "description": "获取单个资产的完整审核详情，包括确定层数据、AI推断结果、置信度等。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_id": {
                    "type": "string",
                    "description": "资产 ID",
                },
                "store_dir": {
                    "type": "string",
                    "description": "标签数据库目录路径",
                },
            },
            "required": ["asset_id", "store_dir"],
        },
    },
}

SUBMIT_REVIEW_DEF = {
    "type": "function",
    "function": {
        "name": "submit_review",
        "description": "提交资产审核结果。支持三种操作：approve（通过）、reject（驳回）、modify（修改后通过）。修改时会自动记录纠正，让系统学习。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_id": {
                    "type": "string",
                    "description": "资产 ID",
                },
                "action": {
                    "type": "string",
                    "enum": ["approve", "reject", "modify"],
                    "description": "审核操作：approve=通过, reject=驳回, modify=修改后通过",
                },
                "corrections": {
                    "type": "object",
                    "description": "修改内容（action=modify 时必填），格式如 {'category': 'weapon/sword', 'style': 'medieval'}",
                },
                "reviewer": {
                    "type": "string",
                    "description": "审核人名称",
                    "default": "",
                },
                "notes": {
                    "type": "string",
                    "description": "审核备注",
                    "default": "",
                },
                "store_dir": {
                    "type": "string",
                    "description": "标签数据库目录路径",
                },
            },
            "required": ["asset_id", "action", "store_dir"],
        },
    },
}

BATCH_APPROVE_DEF = {
    "type": "function",
    "function": {
        "name": "batch_approve",
        "description": "批量通过多个高置信度资产。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "要通过的资产 ID 列表",
                },
                "reviewer": {
                    "type": "string",
                    "description": "审核人名称",
                    "default": "",
                },
                "store_dir": {
                    "type": "string",
                    "description": "标签数据库目录路径",
                },
            },
            "required": ["asset_ids", "store_dir"],
        },
    },
}
