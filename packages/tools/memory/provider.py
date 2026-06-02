"""Memory provider protocol for TA Agent.

Defines the abstract interface for project memory systems.
Implementations can be file-based, database-backed, or null (no-op).
"""

from __future__ import annotations

from typing import Protocol, Optional
from dataclasses import dataclass


@dataclass
class CorrectionRecord:
    """A single user correction record."""
    asset_name: str
    asset_features: dict  # e.g., {"prefix": "SM_", "face_count": 500, "material": "metal"}
    wrong_result: str
    correct_result: str
    reason: str
    timestamp: str  # ISO format


@dataclass
class Rule:
    """A compressed inference rule derived from corrections."""
    rule_id: str
    pattern: str  # human-readable pattern description
    conclusion: str
    hit_count: int = 0
    correction_count: int = 0
    confidence: float = 1.0


class MemoryProvider(Protocol):
    """Abstract interface for project memory.

    Implementations must be stateless per-call — all state is persisted
    externally (files, database, etc.).
    """

    def get_project_profile(self) -> Optional[str]:
        """Return the project profile (L0), or None if not set.

        The profile is a concise summary (<=500 tokens) of project-wide
        conventions: style, naming rules, directory structure, etc.
        """
        ...

    def get_relevant_rules(self, asset_features: dict, limit: int = 5) -> list[Rule]:
        """Return rules relevant to the given asset features.

        Args:
            asset_features: Dict with keys like "prefix", "face_count",
                          "material", "bbox_ratio", etc.
            limit: Maximum number of rules to return.

        Returns:
            List of Rule objects, sorted by relevance (confidence * hit_count).
        """
        ...

    def add_correction(self, record: CorrectionRecord) -> None:
        """Record a user correction.

        This writes to the correction log (L2). Compression to rules (L1)
        happens automatically when the log exceeds the threshold.
        """
        ...

    def update_rule_stats(self, rule_id: str, hit: bool = False, corrected: bool = False) -> None:
        """Update statistics for a rule after it's been used.

        Args:
            rule_id: The rule to update.
            hit: True if the rule was matched during inference.
            corrected: True if the user corrected the rule's conclusion.
        """
        ...

    def compress_if_needed(self) -> Optional[str]:
        """Trigger compression if the correction log exceeds the threshold.

        Returns:
            A summary of what was compressed, or None if no compression needed.
        """
        ...

    def get_memory_stats(self) -> dict:
        """Return current memory statistics for diagnostics.

        Returns:
            Dict with keys like "profile_chars", "rule_count",
            "correction_count", "total_tokens_estimate".
        """
        ...
