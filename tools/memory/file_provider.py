"""File-based memory provider.

Stores project memory in a local `.ta_agent/memory/` directory:
- L0: profile.md (project conventions, <=500 tokens)
- L1: rules.json (compressed inference rules, max 20)
- L2: corrections.jsonl (raw correction log, auto-compressed)
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from .provider import MemoryProvider, CorrectionRecord, Rule


# Constants
MAX_CORRECTIONS_BEFORE_COMPRESS = 10
MAX_RULES = 20
MAX_PROFILE_CHARS = 2000  # ~500 tokens


class FileMemoryProvider:
    """File-backed memory provider.

    All state is persisted in a `.ta_agent/memory/` directory relative
    to the project root.
    """

    def __init__(self, project_root: str):
        self._memory_dir = Path(project_root) / ".ta_agent" / "memory"
        self._profile_path = self._memory_dir / "profile.md"
        self._rules_path = self._memory_dir / "rules.json"
        self._corrections_path = self._memory_dir / "corrections.jsonl"
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        """Create memory directory if it doesn't exist."""
        self._memory_dir.mkdir(parents=True, exist_ok=True)

    # ── L0: Project Profile ──────────────────────────────────────────

    def get_project_profile(self) -> Optional[str]:
        """Read the project profile from disk."""
        if not self._profile_path.exists():
            return None
        text = self._profile_path.read_text(encoding="utf-8").strip()
        return text if text else None

    def update_project_profile(self, new_profile: str) -> None:
        """Write a new project profile. Truncates if too long."""
        if len(new_profile) > MAX_PROFILE_CHARS:
            new_profile = new_profile[:MAX_PROFILE_CHARS]
        self._profile_path.write_text(new_profile, encoding="utf-8")

    # ── L1: Rules ─────────────────────────────────────────────────────

    def _load_rules(self) -> list[dict]:
        """Load rules from disk."""
        if not self._rules_path.exists():
            return []
        try:
            data = json.loads(self._rules_path.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    def _save_rules(self, rules: list[dict]) -> None:
        """Save rules to disk."""
        self._rules_path.write_text(
            json.dumps(rules, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def get_relevant_rules(self, asset_features: dict, limit: int = 5) -> list[Rule]:
        """Return rules relevant to the given asset features.

        Matching strategy: simple keyword overlap between asset features
        and rule pattern. In production, this could use semantic similarity.
        """
        rules_data = self._load_rules()
        if not rules_data:
            return []

        # Score rules by relevance
        scored = []
        for r in rules_data:
            score = self._compute_relevance(r, asset_features)
            if score > 0:
                scored.append((score, r))

        # Sort by score (confidence * hit_count * relevance)
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
        """Compute relevance score between a rule and asset features.

        Uses keyword overlap + confidence weighting.
        """
        pattern_lower = rule.get("pattern", "").lower()
        conclusion_lower = rule.get("conclusion", "").lower()
        search_text = f"{pattern_lower} {conclusion_lower}"

        score = 0.0
        for key, value in features.items():
            if value is None:
                continue
            value_str = str(value).lower()
            # Check if feature value appears in rule pattern/conclusion
            if value_str in search_text:
                score += 1.0
            # Check for prefix patterns
            if key == "prefix" and value_str in pattern_lower:
                score += 2.0

        # Weight by confidence and hit count
        confidence = rule.get("confidence", 1.0)
        hit_count = rule.get("hit_count", 0)
        return score * confidence * (1 + min(hit_count, 10) * 0.1)

    def _add_rule(self, rule: dict) -> None:
        """Add a new rule, enforcing the max limit."""
        rules = self._load_rules()
        rules.append(rule)

        # Enforce max rules — keep highest confidence
        if len(rules) > MAX_RULES:
            rules.sort(key=lambda r: r.get("confidence", 0), reverse=True)
            rules = rules[:MAX_RULES]

        self._save_rules(rules)

    def update_rule_stats(self, rule_id: str, hit: bool = False, corrected: bool = False) -> None:
        """Update statistics for a rule after it's been used."""
        rules = self._load_rules()
        for r in rules:
            if r["rule_id"] == rule_id:
                if hit:
                    r["hit_count"] = r.get("hit_count", 0) + 1
                if corrected:
                    r["correction_count"] = r.get("correction_count", 0) + 1
                # Recalculate confidence
                hits = r.get("hit_count", 0)
                corrections = r.get("correction_count", 0)
                if hits > 0:
                    r["confidence"] = round(1.0 - (corrections / hits), 2)
                break
        self._save_rules(rules)

    # ── L2: Corrections ───────────────────────────────────────────────

    def _load_corrections(self) -> list[dict]:
        """Load all corrections from the JSONL file."""
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
        """Append a single correction to the JSONL file."""
        with open(self._corrections_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def add_correction(self, record: CorrectionRecord) -> None:
        """Record a user correction. Triggers compression if needed."""
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

    # ── Compression ───────────────────────────────────────────────────

    def compress_if_needed(self) -> Optional[str]:
        """Compress corrections into rules when the log exceeds threshold.

        Returns a summary string if compression happened, None otherwise.
        """
        corrections = self._load_corrections()
        if len(corrections) < MAX_CORRECTIONS_BEFORE_COMPRESS:
            return None

        # Group corrections by similar correct_result
        groups: dict[str, list[dict]] = {}
        for c in corrections:
            key = c.get("correct_result", "unknown")
            groups.setdefault(key, []).append(c)

        # Create rules from groups with 2+ corrections
        new_rules = []
        remaining_corrections = []
        for key, group in groups.items():
            if len(group) >= 2:
                # Merge into a rule
                patterns = [c.get("reason", "") for c in group]
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
            # Add new rules
            for rule in new_rules:
                self._add_rule(rule)

            # Rewrite corrections with unmerged ones
            self._corrections_path.write_text(
                "\n".join(json.dumps(c, ensure_ascii=False) for c in remaining_corrections) + "\n",
                encoding="utf-8",
            )

            return f"Compressed {len(corrections)} corrections into {len(new_rules)} rules. {len(remaining_corrections)} corrections remain."

        return None

    def _extract_common_pattern(self, corrections: list[dict]) -> str:
        """Extract a common pattern description from a group of corrections."""
        # Simple heuristic: combine unique feature descriptions
        features_set = set()
        for c in corrections:
            features = c.get("asset_features", {})
            for k, v in features.items():
                if v is not None:
                    features_set.add(f"{k}={v}")
        return " AND ".join(sorted(features_set)) if features_set else "unknown pattern"

    # ── Stats ─────────────────────────────────────────────────────────

    def get_memory_stats(self) -> dict:
        """Return current memory statistics."""
        profile = self.get_project_profile() or ""
        rules = self._load_rules()
        corrections = self._load_corrections()

        profile_chars = len(profile)
        rule_count = len(rules)
        correction_count = len(corrections)

        # Rough token estimate: 1 token ≈ 4 chars for English, ~2 for Chinese
        total_chars = profile_chars + sum(len(json.dumps(r, ensure_ascii=False)) for r in rules)
        total_tokens_estimate = total_chars // 3  # conservative estimate

        return {
            "profile_chars": profile_chars,
            "rule_count": rule_count,
            "correction_count": correction_count,
            "total_tokens_estimate": total_tokens_estimate,
        }
