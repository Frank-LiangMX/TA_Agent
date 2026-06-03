# 发版流程

> 给 Agent 和人读。版本号管理、打 tag、CI 触发、Release 产物。

## 30 秒速记

```bash
# 想发版本？
python scripts/release.py ship 0.30.0 --yes

# 不想发版本，只是存档？
git commit -m "..." && git push origin main
```

**区分**：普通 `git commit/push` = 备份。`ship` = 真发版，会触发 CI build + 创建 GitHub Release。

## 单一来源

版本号写在仓库根目录的 **`VERSION`** 文件里。`ship` 会自动同步到这 4 个文件：

| 文件 | 同步内容 |
|------|---------|
| `VERSION` | `0.30.0` |
| `apps/desktop/package.json` | `"version": "0.30.0"` |
| `apps/desktop/package-lock.json` | 2 处 `"version": "0.30.0"` |
| `backend/agent_main.py` | 字符串里 `v0.30`（前两段） |
| `apps/web/src/App.tsx` | `<span>TAgent v0.30</span>`（前两段） |

**禁止手动改这些文件的版本号**——下次 `ship` 会覆盖回去。

## 工具：`scripts/release.py`

5 个子命令。**Windows 直接 `scripts\release.cmd` 也行**（`.bat` 包装）。

### `status` — 状态总览

```bash
python scripts/release.py status
```

显示：
- 当前 VERSION
- HEAD + 分支
- 工作区是否干净
- 所有 git tag
- 本地 `release/electron/` 下的所有目录，**标记哪些对应 tag、哪些是孤儿**
- 占用空间

**发版前必跑**。

### `bump` — 改版本号

```bash
python scripts/release.py bump 0.30.0
python scripts/release.py bump 0.30.0 --yes   # 跳过 y/N 确认
```

只改 VERSION + 4 个文件。**不 commit、不打 tag、不 push**。后面要手动接 `git commit` 和 `git push`。

适合场景：版本号跟代码一起进同一个 commit（例如一次大重构里同时改了版本号和功能）。

### `tag` — 打 tag

```bash
python scripts/release.py tag              # 打 tag 但不 push（提示你手动 push）
python scripts/release.py tag --push       # 实际 push
python scripts/release.py tag --yes        # 跳过确认
```

从 VERSION 读，加 `v` 前缀。**会自动拒绝工作区不干净**（防误操作）。

适合场景：版本号已经 commit 了，但还没 tag。

### `ship` — 一气呵成（最常用）

```bash
python scripts/release.py ship 0.30.0 --dry-run   # 只看命令
python scripts/release.py ship 0.30.0 --yes       # 真跑
```

按顺序执行：
1. `bump_version.py` 写 VERSION + 4 个文件
2. `git add -A`
3. `git commit -m "chore: bump version to X.Y.Z"`
4. `git push origin main`
5. `git tag -a vX.Y.Z -m "release: vX.Y.Z"`
6. `git push origin vX.Y.Z`  ← **触发 CI**

选项：
- `--no-push-main`：只打 tag，不 push main（main 已最新时用）
- `--dry-run`：只打印不执行
- `--yes`：跳过 y/N 确认

**所有发版走这个命令**。`bump` 和 `tag` 单独用是特殊情况。

### `clean` — 清理历史产物

```bash
python scripts/release.py clean --dry-run       # 只看哪些会被清
python scripts/release.py clean --yes           # 移到 archive/
python scripts/release.py clean --tag old       # 移到 archive/old/
```

扫描 `release/electron/` 下所有子目录：
- **跳过** `latest` 软链、名字匹配 git tag 的目录
- **其它**（如 `20260602-155949/`）当作孤儿，移到 `release/electron/archive/<sub>/`

**不删除，只归档**。彻底删：`rm -rf release/electron/archive/`。

## CI：`.github/workflows/release.yml`

`ship` 触发的 push tag 事件会跑这个 workflow（GitHub Actions `windows-latest`）。

执行步骤：
1. Checkout
2. Setup Python 3.11 + Node 20（带 cache）
3. 装 `requirements.txt` + PyInstaller
4. `npm run build`（前端 → `release/frontend/`）
5. `pyinstaller TAgent.spec --clean --noconfirm`（Python → `release/pyinstaller/TAgent/`）
6. 复制 `release/frontend/` 到 `apps/desktop/dist/`
7. 装 Electron 依赖
8. 生成 `electron-builder.generated.yml`（output 改为 `release/electron/vX.Y.Z/`）
9. `npm run build:win`（打 NSIS 安装包 + `win-unpacked/`）
10. `Compress-Archive win-unpacked/` → `TAgent-X.Y.Z-portable.zip`
11. 上传 GitHub Release

**典型耗时**：4-5 分钟。

### Release 产物

每个 release 附 2 个文件：

| 文件 | 大小 | 用途 |
|------|------|------|
| `TAgent.Setup.X.Y.Z.exe` | ~130 MB | NSIS 安装包（推荐最终用户） |
| `TAgent-X.Y.Z-portable.zip` | ~200 MB | 绿色版（解压即用） |

`green` 版解压后**整个目录**要保留，不只 `TAgent.exe`。

## 错误处理

| 症状 | 原因 | 解决 |
|------|------|------|
| `VERSION not found` | 根目录没 VERSION | `echo "0.29.0" > VERSION` |
| `invalid version: ...` | 不是 x.y.z 格式 | 必须三段数字 |
| `工作区不干净` | `tag` 命令要求 | 先 commit |
| `Tag vX.Y.Z 已存在` | 已经打过 | `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z` 再重打 |
| CI 失败 `TAgent.spec not found` | `.gitignore` 里 `*.spec` 误伤了 | 仓库里**必须有** `!TAgent.spec` 反忽略（已加） |
| CI 失败 `YAML syntax error` | workflow 文件写错 | 修 `.github/workflows/release.yml` |
| Release 里有 201MB 孤儿 `TAgent.exe` | 早期 release 漏了 zip 步骤 | 手动去 GitHub release 页删 |

## 什么时候用 `ship`，什么时候用 `git commit`

| 你想做什么 | 命令 |
|-----------|------|
| 改了点代码，存个档 | `git commit && git push` |
| 改了几个文档 | `git commit && git push` |
| 修了 bug，先不发布 | `git commit && git push` |
| CI 配错了，重跑 | `git commit && git push` |
| **攒够功能/修复，要发版本** | `python scripts/release.py ship X.Y.Z --yes` |
| 修复 critical bug，hotfix | `python scripts/release.py ship X.Y.Z --yes`（patch bump） |
| 改 README、CHANGELOG，不发版 | `git commit && git push` |

**判别标准**：用户用得上吗？**用得上 → ship。用不上 → 普通 commit。**

## SemVer 规则

- **patch** (0.29.0 → 0.29.1)：bug 修复
- **minor** (0.29.0 → 0.30.0)：新功能、向后兼容
- **major** (0.29.0 → 1.0.0)：破坏性改动（你这个项目还没到 1.0）

## 不要做

- ❌ 手动改 `apps/desktop/package.json` 的 `version`（下次 ship 会覆盖）
- ❌ 跳过 `ship` 直接 `git tag vX.Y.Z && git push`（CI 不会被同样方式触发，但 source of truth 错乱）
- ❌ 把 `release/electron/20260602-XXX/` 当成代码改（它是产物，.gitignore）
- ❌ 删 `release/` 目录（latest 软链断，工作流依赖）
- ❌ 删 `VERSION` 文件（所有命令依赖它）
- ❌ 直接改 `.github/workflows/release.yml` 不在本地 YAML 校验过（`python -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`）

## 完整发版示例

```bash
# 1. 看现状
python scripts/release.py status
# 输出: worktree: clean, version: 0.29.0, tag: v0.29.0, 10 orphans

# 2. 干一把（先 dry-run）
python scripts/release.py ship 0.30.0 --dry-run
# 检查命令序列对不对

# 3. 真跑
python scripts/release.py ship 0.30.0 --yes
# 输出: bump → commit → push main → tag → push tag

# 4. 监控
# 打开 https://github.com/Frank-LiangMX/TA_Agent/actions
# 等 4-5 分钟，看 run 是不是绿的

# 5. 验证产物
# 去 https://github.com/Frank-LiangMX/TA_Agent/releases
# 下载 TAgent.Setup.0.30.0.exe 装一下
# 或者下载 portable.zip 解压跑 TAgent.exe

# 6. 清理旧产物（半年一次）
python scripts/release.py clean --yes
# 验证 archive/ 没问题后: rm -rf release/electron/archive/
```
