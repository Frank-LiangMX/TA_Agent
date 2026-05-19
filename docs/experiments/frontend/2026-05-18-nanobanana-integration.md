# NanoBanana 图像生成集成

> 创建日期：2026-05-18 | 状态：待实施

---

## 概述

NanoBanana 是公司内部通用图像生成服务（`tech.seasungame.com`），支持文生图、图生图、风格转换。

## 接口

```
POST https://tech.seasungame.com/ai_in_one/v2/images/generations
Authorization: Bearer {token}

{
    "model": "jsy-nanobanana2-art",
    "prompt": "赛博朋克武器图标",
    "aspect_ratio": "5:4",
    "image_size": "1K",
    "n": 1,
    "response_format": "b64_json"
}
```

## 架构

```
前端 (设置页配置) → 后端 (server.py 配置 API) → 工具层 (tools/nanobanana.py) → NanoBanana API
```

## 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `tools/nanobanana.py` | 新建 | 图像生成工具 |
| `config.py` | 改动 | 新增 NANOBANANA_CONFIG |
| `server.py` | 改动 | 新增配置 API 端点 |
| 前端设置 UI | 改动 | NanoBanana 配置区 |
| 前端结果渲染 | 新建 | 图片展示组件 |

## 实施优先级

| Phase | 内容 |
|-------|------|
| 1 | `tools/nanobanana.py` + `config.py` |
| 2 | `server.py` 配置 API |
| 3 | 前端设置 UI |
| 4 | 图片结果渲染 |
| 5 | 对话图片上传（图生图） |

> 详细设计见原文档 `docs/DESIGN_FRONTEND.md` 第九章（已归档）
