"""
版本号管理脚本

版本号来源：根目录 VERSION 文件（唯一来源）。
向 4 个文件单向同步：apps/desktop/package.json、package-lock.json、
backend/agent_main.py、apps/web/src/App.tsx。

用法：
  python bump_version.py 0.30.0    # 写入 VERSION 并同步所有文件
  python bump_version.py           # 显示当前版本号
"""

import sys
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "VERSION"

# 同步目标：相对 ROOT 的路径
VERSION_FILES = [
    ("apps/desktop/package.json", r'"version":\s*"[^"]*"', '"version": "{version}"'),
    ("apps/desktop/package-lock.json", None, None),  # 特殊处理
    ("backend/agent_main.py", r"v\d+\.\d+", "v{major_minor}"),
    ("apps/web/src/App.tsx", r"v\d+\.\d+", "v{major_minor}"),
]


def get_current_version() -> str:
    """从根目录 VERSION 读，缺失则降级到 apps/desktop/package.json"""
    if VERSION_FILE.is_file():
        text = VERSION_FILE.read_text(encoding="utf-8").strip()
        if re.match(r"^\d+\.\d+\.\d+$", text):
            return text
    legacy = ROOT / "apps" / "desktop" / "package.json"
    if legacy.is_file():
        m = re.search(r'"version":\s*"([^"]*)"', legacy.read_text(encoding="utf-8"))
        if m:
            return m.group(1)
    return "unknown"


def write_version(new_version: str) -> None:
    VERSION_FILE.write_text(new_version + "\n", encoding="utf-8")


def set_version(new_version: str) -> None:
    """写入 VERSION 并同步所有目标文件"""
    parts = new_version.split(".")
    major_minor = f"{parts[0]}.{parts[1]}"

    for rel, pattern, replacement in VERSION_FILES:
        target = ROOT / rel
        if not target.exists():
            print(f"  [跳过] {rel} 不存在")
            continue

        content = target.read_text(encoding="utf-8")

        if rel == "apps/desktop/package-lock.json":
            content = re.sub(
                r'"version":\s*"[\d.]+"',
                f'"version": "{new_version}"',
                content,
                count=2,
            )
        else:
            content = re.sub(pattern, replacement.format(version=new_version, major_minor=major_minor), content)

        target.write_text(content, encoding="utf-8")
        print(f"  [更新] {rel}")

    write_version(new_version)
    print(f"  [更新] VERSION")
    print(f"\n版本号已更新为 {new_version}")


def main() -> None:
    if len(sys.argv) < 2:
        current = get_current_version()
        print(f"当前版本: v{current}")
        print(f"用法: python bump_version.py <version>")
        print(f"示例: python bump_version.py 0.30.0")
        return

    new_version = sys.argv[1]
    if not re.match(r"^\d+\.\d+\.\d+$", new_version):
        print(f"错误: 版本号格式不对，应为 x.y.z（如 0.30.0）")
        sys.exit(1)

    print(f"设置版本号: {new_version}\n")
    set_version(new_version)


if __name__ == "__main__":
    main()
