"""
TAgent 发版管理 CLI

子命令:
  status  - 当前状态总览（版本 / tag / 本地产物 / 工作区）
  bump    - 写入新版本号到 VERSION + 同步所有文件
  tag     - 从 VERSION 读版本号，打 tag 并 push（触发 CI）
  ship    - 一气呵成：bump + commit + tag + push
  clean   - 清理 release/electron/ 下无 tag 对应的历史时间戳目录

设计原则:
  - 不调外部包，纯标准库
  - 所有破坏性操作默认要求 --yes 跳过确认（除显式 y/N 提示）
  - 不修改 git 历史（无 --amend、无 reset）
  - 颜色输出仅在 stdout 是 TTY 时启用
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "VERSION"
RELEASE_DIR = ROOT / "release" / "electron"


# ---------- helpers ----------

def _supports_color() -> bool:
    return sys.stdout.isatty() and sys.platform != "win32" or (
        sys.stdout.isatty() and sys.platform == "win32"
        and "WT_SESSION" in __import__("os").environ
    )


USE_COLOR = _supports_color()


def c(code: str, text: str) -> str:
    if not USE_COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"


def green(t: str) -> str: return c("32", t)
def red(t: str) -> str: return c("31", t)
def yellow(t: str) -> str: return c("33", t)
def cyan(t: str) -> str: return c("36", t)
def dim(t: str) -> str: return c("2", t)


def run(cmd: list[str], cwd: Path = ROOT, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    """跑子进程，Windows 平台默认 shell=False 调 git"""
    result = subprocess.run(
        cmd, cwd=cwd, check=False,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True,
    )
    if check and result.returncode != 0:
        msg = result.stderr or result.stdout or ""
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(cmd)}\n{msg}")
    return result


def read_version() -> str:
    if not VERSION_FILE.is_file():
        raise FileNotFoundError(f"VERSION not found at {VERSION_FILE}")
    return VERSION_FILE.read_text(encoding="utf-8").strip()


def write_version(v: str) -> None:
    if not re.match(r"^\d+\.\d+\.\d+$", v):
        raise ValueError(f"invalid version: {v!r} (expected x.y.z)")
    VERSION_FILE.write_text(v + "\n", encoding="utf-8")


def git(args: list[str], check: bool = True) -> str:
    """跑 git 命令，stdout 字符串返回"""
    result = run(["git", *args], check=check)
    return (result.stdout or "").strip()


def confirm(prompt: str, assume_yes: bool) -> bool:
    if assume_yes:
        print(f"{prompt} {dim('[--yes]')}")
        return True
    try:
        ans = input(f"{prompt} [y/N]: ").strip().lower()
    except EOFError:
        return False
    return ans in ("y", "yes")


# ---------- subcommand: status ----------

def list_git_tags() -> list[str]:
    out = git(["tag", "--list", "v*", "--sort=-v:refname"])
    return [t for t in out.splitlines() if t]


def list_local_release_dirs() -> list[Path]:
    if not RELEASE_DIR.is_dir():
        return []
    return sorted([p for p in RELEASE_DIR.iterdir() if p.is_dir()])


def get_working_tree_status() -> tuple[int, int]:
    """返回 (unstaged_count, staged_count)"""
    porcelain = git(["status", "--porcelain"], check=False)
    if not porcelain:
        return (0, 0)
    unstaged = staged = 0
    for line in porcelain.splitlines():
        # 格式: "XY msg"  前两字符是状态
        x, y = line[0], line[1] if len(line) > 1 else " "
        if x != " ":
            unstaged += 1
        if y != " ":
            staged += 1
    return (unstaged, staged)


def cmd_status(_args: argparse.Namespace) -> int:
    print(cyan("═══ TAgent Release Status ═══"))
    print()

    # 版本
    try:
        v = read_version()
        print(f"  {dim('version:')}  {green(v)}")
    except FileNotFoundError as e:
        print(f"  {red('version:')}  {e}")
        return 1

    # HEAD / 远端同步
    head = git(["rev-parse", "--short", "HEAD"], check=False)
    branch = git(["rev-parse", "--abbrev-ref", "HEAD"], check=False)
    print(f"  {dim('branch:')}   {branch} @ {head}")

    ahead_behind = git(["rev-list", "--left-right", "--count", "HEAD...@{u}"], check=False)
    if "\t" in ahead_behind:
        ahead, behind = ahead_behind.split("\t")
        if ahead != "0" or behind != "0":
            print(f"  {dim('sync:')}     ahead {ahead}, behind {behind}")

    # 工作区
    unstaged, staged = get_working_tree_status()
    if unstaged or staged:
        print(f"  {dim('worktree:')} {yellow(f'{unstaged} unstaged, {staged} staged')}")
    else:
        print(f"  {dim('worktree:')} {green('clean')}")

    # Tags
    tags = list_git_tags()
    print()
    print(cyan(f"  Tags ({len(tags)}):"))
    if tags:
        for t in tags[:10]:
            print(f"    {green(t)}")
        if len(tags) > 10:
            print(f"    {dim(f'... and {len(tags) - 10} more')}")
    else:
        print(f"    {dim('(none)')}")

    # 本地 release 目录
    print()
    print(cyan("  Local release bundles:"))
    dirs = list_local_release_dirs()
    tag_set = set(tags)
    if not dirs:
        print(f"    {dim('(no release/electron/ subdirs)')}")
    else:
        for d in dirs:
            match = "✓" if d.name in tag_set or d.name == "latest" else "✗"
            color = green if match == "✓" else yellow

            def _dir_size(p: Path) -> int:
                """递归累计文件大小；遇到符号链接指向目录时不递归"""
                total = 0
                for child in p.iterdir():
                    try:
                        if child.is_symlink():
                            target = child.resolve()
                            if target.is_dir():
                                total += _dir_size(target)
                            else:
                                total += target.stat().st_size
                        elif child.is_file():
                            total += child.stat().st_size
                        elif child.is_dir():
                            total += _dir_size(child)
                    except OSError:
                        pass
                return total

            size_mb = _dir_size(d) / 1024 / 1024

            extra = ""
            if d.name not in tag_set and d.name != "latest":
                extra = f" {dim('(no matching tag)')}"
            print(f"    {color(match)} {d.name}  {dim(f'{size_mb:.0f} MB')}{extra}")

    # 提示
    orphans = [d.name for d in dirs if d.name not in tag_set and d.name != "latest"]
    if orphans:
        print()
        print(yellow(f"  → {len(orphans)} orphan bundle(s). Run `release clean` to archive."))

    return 0


# ---------- subcommand: bump ----------

def import_bump_module():
    """动态 import scripts/bump_version.py"""
    import importlib.util
    spec = importlib.util.spec_from_file_location("bump_version", ROOT / "scripts" / "bump_version.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def cmd_bump(args: argparse.Namespace) -> int:
    new_v = args.version
    if not re.match(r"^\d+\.\d+\.\d+$", new_v):
        print(red(f"错误: 版本号格式不对: {new_v}（应为 x.y.z）"))
        return 1

    old_v = read_version()
    if new_v == old_v:
        print(yellow(f"版本号已经是 {new_v}，无需更新"))
        return 0

    # 简单 SemVer 检查
    def parse(v: str) -> tuple[int, int, int]:
        return tuple(int(x) for x in v.split("."))

    if parse(new_v) < parse(old_v):
        print(yellow(f"⚠ 新版本 {new_v} 低于当前 {old_v}"))

    if not confirm(f"将版本 {old_v} → {new_v}？", args.yes):
        print("已取消")
        return 0

    bump = import_bump_module()
    bump.set_version(new_v)
    print()
    print(green(f"✓ 已 bump 到 {new_v}"))
    print(dim("  下一步: git add -A && git commit -m 'chore: bump version'"))
    return 0


# ---------- subcommand: tag ----------

def cmd_tag(args: argparse.Namespace) -> int:
    v = read_version()
    tag = f"v{v}"

    existing = git(["tag", "--list", tag], check=False)
    if existing:
        print(yellow(f"Tag {tag} 已存在。删除重打: git tag -d {tag} && git push origin :refs/tags/{tag}"))
        return 1

    # 工作区必须 clean
    unstaged, staged = get_working_tree_status()
    if unstaged or staged:
        print(red(f"工作区不干净 ({unstaged} unstaged, {staged} staged)，请先 commit"))
        return 1

    if not confirm(f"打 tag {tag} 并 push 到 origin？", args.yes):
        print("已取消")
        return 0

    if args.dry_run:
        print(dim(f"[dry-run] git tag -a {tag} -m 'release: {tag}'"))
        print(dim(f"[dry-run] git push origin {tag}"))
        return 0

    git(["tag", "-a", tag, "-m", f"release: {tag}"])
    print(green(f"✓ Created tag {tag}"))

    if args.push:
        git(["push", "origin", tag])
        print(green(f"✓ Pushed {tag} → CI will build release"))
    else:
        print(dim(f"  Run `git push origin {tag}` to trigger CI"))
    return 0


# ---------- subcommand: ship ----------

def cmd_ship(args: argparse.Namespace) -> int:
    v = args.version
    if not re.match(r"^\d+\.\d+\.\d+$", v):
        print(red(f"错误: 版本号格式不对: {v}"))
        return 1

    old_v = read_version()
    print(cyan(f"═══ Ship {old_v} → {v} ═══"))
    print()

    if not confirm(f"将 bump 到 {v}，commit，tag 并 push？", args.yes):
        print("已取消")
        return 0

    if args.dry_run:
        print(dim("[dry-run] bump_version.py set_version"))
        print(dim(f"[dry-run] git add -A"))
        print(dim(f"[dry-run] git commit -m 'chore: bump version to {v}'"))
        print(dim(f"[dry-run] git tag -a v{v} -m 'release: v{v}'"))
        print(dim(f"[dry-run] git push origin main"))
        print(dim(f"[dry-run] git push origin v{v}"))
        return 0

    # 1) bump
    bump = import_bump_module()
    bump.set_version(v)

    # 2) commit
    git(["add", "-A"])
    msg = f"chore: bump version to {v}"
    git(["commit", "-m", msg])
    print(green(f"✓ Committed: {msg}"))

    # 3) push main
    if not args.no_push_main:
        git(["push", "origin", "main"])
        print(green(f"✓ Pushed main"))

    # 4) tag
    tag = f"v{v}"
    git(["tag", "-a", tag, "-m", f"release: {tag}"])
    print(green(f"✓ Created tag {tag}"))

    # 5) push tag
    git(["push", "origin", tag])
    print(green(f"✓ Pushed {tag} → CI building release"))

    print()
    print(green(f"🎉 Release {tag} 在路上。"))
    print(dim("  监控: https://github.com/Frank-LiangMX/TA_Agent/actions"))
    return 0


# ---------- subcommand: clean ----------

def cmd_clean(args: argparse.Namespace) -> int:
    if not RELEASE_DIR.is_dir():
        print(dim("release/electron/ 不存在，无可清理"))
        return 0

    tag_set = set(list_git_tags())
    orphans: list[Path] = []
    for d in RELEASE_DIR.iterdir():
        if not d.is_dir():
            continue
        if d.name == "latest":
            continue
        if d.name in tag_set:
            continue
        orphans.append(d)

    if not orphans:
        print(green("✓ 没有 orphan 目录"))
        return 0

    print(cyan(f"Found {len(orphans)} orphan bundle(s):"))
    for d in orphans:
        size_mb = sum(p.stat().st_size for p in d.rglob("*") if p.is_file()) / 1024 / 1024
        print(f"  {yellow(d.name)}  {dim(f'{size_mb:.0f} MB')}")

    archive = RELEASE_DIR / "archive"
    target = archive / (args.tag or "no-tag")

    if args.dry_run:
        print()
        print(dim(f"[dry-run] mkdir {target}"))
        print(dim(f"[dry-run] mv {len(orphans)} dirs → {target}"))
        return 0

    if not confirm(f"移到 {target}？", args.yes):
        print("已取消")
        return 0

    target.mkdir(parents=True, exist_ok=True)
    for d in orphans:
        dest = target / d.name
        if dest.exists():
            shutil.rmtree(dest)
        shutil.move(str(d), str(dest))
        print(dim(f"  moved {d.name} → archive/"))

    print()
    print(green(f"✓ Archived {len(orphans)} bundle(s) to {target}"))
    print(dim(f"  如需彻底删除: rm -rf {target}"))
    return 0


# ---------- main ----------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="release",
        description="TAgent 发版管理",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status", help="看当前状态总览")

    bump_p = sub.add_parser("bump", help="bump 版本号（写到 VERSION）")
    bump_p.add_argument("version", help="新版本号，如 0.30.0")
    bump_p.add_argument("--yes", "-y", action="store_true", help="跳过确认")

    tag_p = sub.add_parser("tag", help="从 VERSION 读版本号打 tag 并 push")
    tag_p.add_argument("--push", action="store_true", help="实际 push（默认 dry-run）")
    tag_p.add_argument("--yes", "-y", action="store_true", help="跳过确认")

    ship_p = sub.add_parser("ship", help="bump + commit + tag + push")
    ship_p.add_argument("version", help="新版本号")
    ship_p.add_argument("--yes", "-y", action="store_true", help="跳过确认")
    ship_p.add_argument("--no-push-main", action="store_true", help="不 push main（只打 tag）")
    ship_p.add_argument("--dry-run", action="store_true", help="只打印命令不执行")

    clean_p = sub.add_parser("clean", help="清理无 tag 对应的 release 目录到 archive/")
    clean_p.add_argument("--tag", help="归档子目录名（默认 'no-tag'）")
    clean_p.add_argument("--yes", "-y", action="store_true", help="跳过确认")
    clean_p.add_argument("--dry-run", action="store_true", help="只看不执行")

    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    handlers = {
        "status": cmd_status,
        "bump": cmd_bump,
        "tag": cmd_tag,
        "ship": cmd_ship,
        "clean": cmd_clean,
    }
    try:
        return handlers[args.cmd](args)
    except KeyboardInterrupt:
        print(yellow("\ninterrupted"))
        return 130


if __name__ == "__main__":
    sys.exit(main())
