"""
tags 包 - 资产身份系统

模块划分：
  schema.py     - 资产标签数据结构定义
  extractor.py  - 标签提取器（确定性数据自动提取）
  store.py      - 标签持久化存储
"""
from tags.schema import AssetTags, BoundingBox
from tags.extractor import TagExtractor
from tags.store import TagStore
