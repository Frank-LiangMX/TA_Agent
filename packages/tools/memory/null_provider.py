"""Null memory provider — a no-op implementation.

Used when memory is disabled or not initialized.
All methods return empty/None without side effects.
"""

from __future__ import annotations

from typing import Optional

from .provider import MemoryProvider, CorrectionRecord, Rule


class NullMemoryProvider:
    """No-op memory provider. Does nothing, stores nothing."""

    def get_project_profile(self) -> Optional[str]:
        return None

    def get_relevant_rules(self, asset_features: dict, limit: int = 5) -> list[Rule]:
        return []

    def add_correction(self, record: CorrectionRecord) -> None:
        pass

    def update_rule_stats(self, rule_id: str, hit: bool = False, corrected: bool = False) -> None:
        pass

    def compress_if_needed(self) -> Optional[str]:
        return None

    def get_memory_stats(self) -> dict:
        return {
            "profile_chars": 0,
            "rule_count": 0,
            "correction_count": 0,
            "total_tokens_estimate": 0,
        }
