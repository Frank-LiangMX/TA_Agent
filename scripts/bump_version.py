"""
版本号管理脚本

用法：
  python bump_version.py 0.28.0    # 设置版本号
  python bump_version.py           # 显示当前版本号
"""

import sys
import re
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 版本号来源文件和匹配模式
VERSION_FILES = [
    ("apps/desktop/package.json", r'"version":\s*"[^"]*"', '"version": "{version}"'),
    ("apps/desktop/package-lock.json", None, None),  # 特殊处理
    ("backend/agent_main.py", r"v\d+\.\d+", "v{major_minor}"),
    ("apps/web/src/App.tsx", r"v\d+\.\d+", "v{major_minor}"),
]


def get_current_version():
    """从 electron/package.json 读取当前版本号"""
    path = os.path.join(ROOT, "apps", "desktop", "package.json")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    match = re.search(r'"version":\s*"([^"]*)"', content)
    return match.group(1) if match else "unknown"


def set_version(new_version):
    """设置所有文件的版本号"""
    # 解析版本号
    parts = new_version.split(".")
    major_minor = f"{parts[0]}.{parts[1]}"

    for filepath, pattern, replacement in VERSION_FILES:
        full_path = os.path.join(ROOT, filepath)
        if not os.path.exists(full_path):
            print(f"  [跳过] {filepath} 不存在")
            continue

        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()

        if filepath == "apps/desktop/package-lock.json":
            # package-lock.json: 替换所有版本号
            content = re.sub(
                r'"version":\s*"[\d.]+"',
                f'"version": "{new_version}"',
                content,
                count=2,  # 只替换前两个（根 + packages[""]）
            )
        else:
            content = re.sub(pattern, replacement.format(version=new_version, major_minor=major_minor), content)

        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)

        print(f"  [更新] {filepath}")

    print(f"\n版本号已更新为 {new_version}")


def main():
    if len(sys.argv) < 2:
        current = get_current_version()
        print(f"当前版本: v{current}")
        print(f"用法: python bump_version.py <version>")
        print(f"示例: python bump_version.py 0.28.0")
        return

    new_version = sys.argv[1]
    if not re.match(r"^\d+\.\d+\.\d+$", new_version):
        print(f"错误: 版本号格式不对，应为 x.y.z（如 0.28.0）")
        sys.exit(1)

    print(f"设置版本号: {new_version}\n")
    set_version(new_version)


if __name__ == "__main__":
    main()
