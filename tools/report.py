"""
报告生成工具
"""


SCHEMA = {
    "type": "function",
    "function": {
        "name": "generate_report",
        "description": "生成质检报告。接收检查结果列表，输出格式化的报告。",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "报告标题"
                },
                "results": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "asset": {"type": "string", "description": "资产名称"},
                            "check": {"type": "string", "description": "检查项"},
                            "status": {"type": "string", "enum": ["pass", "fail", "warning"]},
                            "detail": {"type": "string", "description": "详细说明"}
                        }
                    },
                    "description": "检查结果列表"
                }
            },
            "required": ["title", "results"]
        }
    }
}


def generate_report(title: str, results: list) -> dict:
    """生成格式化报告"""
    pass_count = sum(1 for r in results if r.get("status") == "pass")
    fail_count = sum(1 for r in results if r.get("status") == "fail")
    warn_count = sum(1 for r in results if r.get("status") == "warning")

    return {
        "title": title,
        "summary": {
            "total": len(results),
            "pass": pass_count,
            "fail": fail_count,
            "warning": warn_count,
        },
        "results": results,
    }
