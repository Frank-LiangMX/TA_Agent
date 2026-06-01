"""File-based memory provider.

Layout v1 (B+):
- index.md   — short pointer + RULES, injected every turn
- facts.md   — stable facts, read on demand
- sops/      — developer procedure docs
- rules.json / corrections.jsonl — TA L1/L2 (unchanged)

Legacy profile.md is migrated to facts.md on first load.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from config import MEMORY_DIR, get_memory_namespace
from .provider import MemoryProvider, CorrectionRecord, Rule


MAX_CORRECTIONS_BEFORE_COMPRESS = 10
MAX_RULES = 20
MAX_INDEX_CHARS = 1500
MAX_FACTS_CHARS = 8000

DEFAULT_INDEX = """# 记忆索引

facts 存路径与偏好，需要时用 memory_read_facts 读取。
sops 存流程说明书，需要时用 memory_read_sop 读取。

## 导航
（暂无条目 — 写入事实后会自动添加 section 导航）

[RULES]
"""

SOPS_README = """# SOP 目录

开发者在此放置 `*_sop.md` 操作说明书。
Agent 通过 memory_read_sop(name="文件名不含扩展名") 按需读取。
参考仓库 docs/sops/tagent_memory_sop.md
"""


class FileMemoryProvider:
    """File-backed memory provider under MEMORY_DIR/{namespace}/."""

    def __init__(self, project_root: str = None, namespace: str | None = None):
        self._namespace = (namespace or get_memory_namespace()).strip().lower() or "ta"
        self._memory_dir = Path(MEMORY_DIR) / self._namespace
        self._index_path = self._memory_dir / "index.md"
        self._facts_path = self._memory_dir / "facts.md"
        self._profile_path = self._memory_dir / "profile.md"  # legacy
        self._rules_path = self._memory_dir / "rules.json"
        self._corrections_path = self._memory_dir / "corrections.jsonl"
        self._sops_dir = self._memory_dir / "sops"
        self._ensure_dirs()
        self._migrate_legacy_profile()

    def _ensure_dirs(self) -> None:
        self._memory_dir.mkdir(parents=True, exist_ok=True)
        self._sops_dir.mkdir(parents=True, exist_ok=True)
        readme = self._sops_dir / "README.md"
        if not readme.exists():
            readme.write_text(SOPS_README, encoding="utf-8")

    def _migrate_legacy_profile(self) -> None:
        if not self._profile_path.exists():
            return
        legacy = self._profile_path.read_text(encoding="utf-8").strip()
        if not legacy:
            return
        if not self._facts_path.exists():
            self._write_facts(legacy)
        if not self._index_path.exists():
            self._write_index(self._index_from_facts(legacy))

    def _read_text(self, path: Path) -> str:
        if not path.exists():
            return ""
        return path.read_text(encoding="utf-8").strip()

    def _write_index(self, text: str) -> None:
        text = text.strip()
        if len(text) > MAX_INDEX_CHARS:
            text = text[:MAX_INDEX_CHARS]
        self._index_path.write_text(text + "\n", encoding="utf-8")

    def _write_facts(self, text: str) -> None:
        text = text.strip()
        if len(text) > MAX_FACTS_CHARS:
            text = text[:MAX_FACTS_CHARS]
        self._facts_path.write_text(text + ("\n" if text else ""), encoding="utf-8")

    def _index_from_facts(self, facts: str) -> str:
        sections = re.findall(r"^##\s+(.+)$", facts, re.MULTILINE)
        lines = ["# 记忆索引", "", "facts 详情用 memory_read_facts；流程用 memory_read_sop。", "", "## 导航"]
        if sections:
            for sec in sections:
                lines.append(f"- {sec.strip()} → facts ## {sec.strip()}")
        else:
            lines.append("- （见 facts 全文）→ memory_read_facts")
        lines.extend(["", "[RULES]", ""])
        return "\n".join(lines)

    def _sync_index_nav_for_section(self, section: str) -> None:
        sec = section.strip()
        if not sec:
            return
        index = self.get_memory_index() or DEFAULT_INDEX
        nav_line = f"- {sec} → facts ## {sec}"
        if nav_line in index:
            return
        header = "## 导航"
        if header in index:
            parts = index.split(header, 1)
            rest = parts[1]
            if "[RULES]" in rest:
                nav_body, rules_part = rest.split("[RULES]", 1)
                nav_body = nav_body.rstrip() + "\n" + nav_line
                index = parts[0].rstrip() + "\n\n" + header + nav_body + "\n[RULES]" + rules_part
            else:
                index = index.rstrip() + "\n" + nav_line
        else:
            index = index.rstrip() + f"\n\n{header}\n{nav_line}\n"
        self._write_index(index)

    # ── index / facts (v1) ───────────────────────────────────────────

    def get_memory_index(self) -> Optional[str]:
        text = self._read_text(self._index_path)
        if text:
            return text
        if self._facts_path.exists():
            return self._index_from_facts(self._read_text(self._facts_path))
        return None

    def get_memory_facts(self) -> Optional[str]:
        text = self._read_text(self._facts_path)
        return text if text else None

    def get_memory_facts_section(self, section: str) -> Optional[str]:
        facts = self.get_memory_facts()
        if not facts or not section.strip():
            return facts
        header = f"## {section.strip()}"
        if header not in facts:
            return None
        parts = facts.split(header, 1)
        rest = parts[1]
        if "\n## " in rest:
            body, _ = rest.split("\n## ", 1)
            return (header + body).strip()
        return (header + rest).strip()

    def update_memory_index(self, content: str) -> None:
        self._write_index(content)

    def update_memory_facts(self, content: str) -> None:
        self._write_facts(content)
        if not self._index_path.exists():
            self._write_index(self._index_from_facts(content))

    def append_fact(self, fact: str, section: str = "", dedupe_key: str | None = None) -> dict:
        text = (fact or "").strip()
        if not text:
            return {"error": "fact 不能为空"}

        line = text if text.startswith("-") else f"- {text}"
        key = (dedupe_key or "").strip()
        if not key and ":" in text.split("：")[0]:
            key = text.split("：")[0].split(":")[0].strip()

        existing = self.get_memory_facts() or ""
        sec = section.strip()

        if sec:
            header = f"## {sec}"
            if header in existing:
                parts = existing.split(header, 1)
                before = parts[0].rstrip()
                rest = parts[1]
                if "\n## " in rest:
                    body, after = rest.split("\n## ", 1)
                    body = self._upsert_fact_line(body, line, key)
                    new_facts = f"{before}\n\n{header}{body}\n## {after}".strip()
                else:
                    body = self._upsert_fact_line(rest, line, key)
                    new_facts = f"{before}\n\n{header}\n{body}".strip()
            else:
                block = f"{header}\n{line}"
                new_facts = f"{existing}\n\n{block}".strip() if existing else block
            self._sync_index_nav_for_section(sec)
        else:
            new_facts = self._upsert_fact_line(existing, line, key) if existing else line

        self.update_memory_facts(new_facts)
        return {
            "success": True,
            "facts_chars": len(new_facts),
            "section": sec or None,
        }

    def _upsert_fact_line(self, body: str, line: str, key: str) -> str:
        if not key:
            if line in body:
                return body.strip()
            return (body.rstrip() + "\n" + line).strip()

        lines_out: list[str] = []
        replaced = False
        key_lower = key.lower()
        for raw in body.splitlines():
            stripped = raw.strip()
            if not stripped:
                continue
            content = stripped.lstrip("-").strip()
            item_key = content.split("：")[0].split(":")[0].strip().lower()
            if item_key == key_lower:
                if not replaced:
                    lines_out.append(line)
                    replaced = True
                continue
            lines_out.append(stripped if stripped.startswith("-") else f"- {stripped}")
        if not replaced:
            lines_out.append(line)
        return "\n".join(lines_out)

    def read_sop(self, name: str) -> Optional[str]:
        raw = (name or "").strip().replace("\\", "/")
        if not raw or ".." in raw:
            return None
        base = raw.replace(".md", "")
        path = self._sops_dir / f"{base}.md"
        if not path.is_file():
            return None
        return path.read_text(encoding="utf-8").strip()

    def list_sops(self) -> list[str]:
        return sorted(
            p.stem for p in self._sops_dir.glob("*.md") if p.name.lower() != "readme.md"
        )

    # ── Legacy L0 API (index for injection) ────────────────────────────

    def get_project_profile(self) -> Optional[str]:
        """Injected each turn: memory index (not full facts)."""
        return self.get_memory_index()

    def update_project_profile(self, new_profile: str) -> None:
        """Legacy name: updates facts.md (full merge/replace of facts body)."""
        self.update_memory_facts(new_profile)

    # ── L1: Rules ─────────────────────────────────────────────────────

    def _load_rules(self) -> list[dict]:
        if not self._rules_path.exists():
            return []
        try:
            data = json.loads(self._rules_path.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    def _save_rules(self, rules: list[dict]) -> None:
        self._rules_path.write_text(
            json.dumps(rules, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def get_relevant_rules(self, asset_features: dict, limit: int = 5) -> list[Rule]:
        rules_data = self._load_rules()
        if not rules_data:
            return []

        scored = []
        for r in rules_data:
            score = self._compute_relevance(r, asset_features)
            if score > 0:
                scored.append((score, r))

        scored.sort(key=lambda x: x[0], reverse=True)

        return [
            Rule(
                rule_id=r["rule_id"],
                pattern=r["pattern"],
                conclusion=r["conclusion"],
                hit_count=r.get("hit_count", 0),
                correction_count=r.get("correction_count", 0),
                confidence=r.get("confidence", 1.0),
            )
            for _, r in scored[:limit]
        ]

    def _compute_relevance(self, rule: dict, features: dict) -> float:
        pattern_lower = rule.get("pattern", "").lower()
        conclusion_lower = rule.get("conclusion", "").lower()
        search_text = f"{pattern_lower} {conclusion_lower}"

        score = 0.0
        for key, value in features.items():
            if value is None:
                continue
            value_str = str(value).lower()
            if value_str in search_text:
                score += 1.0
            if key == "prefix" and value_str in pattern_lower:
                score += 2.0

        confidence = rule.get("confidence", 1.0)
        hit_count = rule.get("hit_count", 0)
        return score * confidence * (1 + min(hit_count, 10) * 0.1)

    def _add_rule(self, rule: dict) -> None:
        rules = self._load_rules()
        rules.append(rule)
        if len(rules) > MAX_RULES:
            rules.sort(key=lambda r: r.get("confidence", 0), reverse=True)
            rules = rules[:MAX_RULES]
        self._save_rules(rules)

    def update_rule_stats(self, rule_id: str, hit: bool = False, corrected: bool = False) -> None:
        rules = self._load_rules()
        for r in rules:
            if r["rule_id"] == rule_id:
                if hit:
                    r["hit_count"] = r.get("hit_count", 0) + 1
                if corrected:
                    r["correction_count"] = r.get("correction_count", 0) + 1
                hits = r.get("hit_count", 0)
                corrections = r.get("correction_count", 0)
                if hits > 0:
                    r["confidence"] = round(1.0 - (corrections / hits), 2)
                break
        self._save_rules(rules)

    # ── L2: Corrections ───────────────────────────────────────────────

    def _load_corrections(self) -> list[dict]:
        if not self._corrections_path.exists():
            return []
        corrections = []
        for line in self._corrections_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                try:
                    corrections.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return corrections

    def _append_correction(self, record: dict) -> None:
        with open(self._corrections_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def add_correction(self, record: CorrectionRecord) -> None:
        entry = {
            "asset_name": record.asset_name,
            "asset_features": record.asset_features,
            "wrong_result": record.wrong_result,
            "correct_result": record.correct_result,
            "reason": record.reason,
            "timestamp": record.timestamp or datetime.now().isoformat(),
        }
        self._append_correction(entry)
        self.compress_if_needed()

    def compress_if_needed(self) -> Optional[str]:
        corrections = self._load_corrections()
        if len(corrections) < MAX_CORRECTIONS_BEFORE_COMPRESS:
            return None

        groups: dict[str, list[dict]] = {}
        for c in corrections:
            key = c.get("correct_result", "unknown")
            groups.setdefault(key, []).append(c)

        new_rules = []
        remaining_corrections = []
        for key, group in groups.items():
            if len(group) >= 2:
                common_pattern = self._extract_common_pattern(group)
                rule = {
                    "rule_id": str(uuid.uuid4())[:8],
                    "pattern": common_pattern,
                    "conclusion": key,
                    "hit_count": 0,
                    "correction_count": 0,
                    "confidence": 0.9,
                    "source_count": len(group),
                    "created_at": datetime.now().isoformat(),
                }
                new_rules.append(rule)
            else:
                remaining_corrections.extend(group)

        if new_rules:
            for rule in new_rules:
                self._add_rule(rule)
            self._corrections_path.write_text(
                "\n".join(json.dumps(c, ensure_ascii=False) for c in remaining_corrections) + "\n",
                encoding="utf-8",
            )
            return (
                f"Compressed {len(corrections)} corrections into {len(new_rules)} rules. "
                f"{len(remaining_corrections)} corrections remain."
            )
        return None

    def _extract_common_pattern(self, corrections: list[dict]) -> str:
        features_set = set()
        for c in corrections:
            features = c.get("asset_features", {})
            for k, v in features.items():
                if v is not None:
                    features_set.add(f"{k}={v}")
        return " AND ".join(sorted(features_set)) if features_set else "unknown pattern"

    # ── Stats ─────────────────────────────────────────────────────────

    def get_memory_stats(self) -> dict:
        index = self.get_memory_index() or ""
        facts = self.get_memory_facts() or ""
        rules = self._load_rules()
        corrections = self._load_corrections()
        sops = self.list_sops()

        index_chars = len(index)
        facts_chars = len(facts)
        total_chars = index_chars + facts_chars + sum(
            len(json.dumps(r, ensure_ascii=False)) for r in rules
        )

        return {
            "namespace": self._namespace,
            "layout_version": 1,
            "index_chars": index_chars,
            "facts_chars": facts_chars,
            "profile_chars": index_chars + facts_chars,
            "rule_count": len(rules),
            "correction_count": len(corrections),
            "sop_count": len(sops),
            "sops": sops,
            "total_tokens_estimate": total_chars // 3,
        }
