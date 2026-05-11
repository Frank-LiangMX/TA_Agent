"""
tools 包 - TA Agent 所有工具的模块化组织

模块划分：
  naming.py      - 命名规范检查
  directory.py   - 目录结构检查
  file_info.py   - 文件信息获取与目录扫描
  mesh.py        - 面数预算检查
  mesh_fbx.py    - FBX 模型深度解析（trimesh）
  texture.py     - 贴图深度检查（Pillow）
  report.py      - 报告生成
  registry.py    - 工具注册中心（Schema + 分发器）
"""
from tools.registry import TOOLS, execute_tool
