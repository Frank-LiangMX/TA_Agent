"""Memory tools for TA Agent.

Provides utility functions for memory injection and correction recording.
These are called by the analysis agent, not by LLM directly.
"""

from __future__ import annotations

from typing import Optional

from .provider import MemoryProvider, CorrectionRecord


def build_memory_context(
    memory: MemoryProvider,
    asset_features: dict,
    max_rules: int = 5,
) -> Optional[str]:
    """Build a memory context string for injection into the inference prompt.

    Combines:
    - L0: Project profile (if exists)
    - L1: Relevant rules (up to max_rules)

    Args:
        memory: The memory provider instance.
        asset_features: Features of the asset being analyzed.
        max_rules: Maximum number of rules to include.

    Returns:
        A formatted string to inject into the prompt, or None if no memory.
    """
    parts = []

    # L0: Project profile
    profile = memory.get_project_profile()
    if profile:
        parts.append(f"[项目画像]\n{profile}")

    # L1: Relevant rules
    rules = memory.get_relevant_rules(asset_features, limit=max_rules)
    if rules:
        rule_lines = []
        for i, r in enumerate(rules, 1):
            confidence_str = f"置信度 {r.confidence:.0%}" if r.confidence < 1.0 else "已确认"
            rule_lines.append(f"  {i}. {r.pattern} → {r.conclusion}（{confidence_str}，命中 {r.hit_count} 次）")
        parts.append("[项目规则]\n" + "\n".join(rule_lines))

    if not parts:
        return None

    return "\n\n".join(parts)


def extract_asset_features(
    asset_name: str,
    face_count: int = 0,
    vertex_count: int = 0,
    material_name: Optional[str] = None,
    texture_names: Optional[list[str]] = None,
    bbox_size: Optional[tuple[float, float, float]] = None,
) -> dict:
    """Extract searchable features from asset metadata for memory matching.

    Args:
        asset_name: Name of the asset file.
        face_count: Number of faces.
        vertex_count: Number of vertices.
        material_name: Primary material name.
        texture_names: List of texture file names.
        bbox_size: Bounding box dimensions (width, height, depth).

    Returns:
        Dict of features for memory rule matching.
    """
    features = {
        "name": asset_name,
        "face_count": face_count,
        "vertex_count": vertex_count,
    }

    # Extract naming prefix
    if "_" in asset_name:
        prefix = asset_name.split("_")[0].upper()
        if prefix in ("SM", "M", "T", "BP", "BLD", "CHR", "WP", "FX"):
            features["prefix"] = prefix

    # Material
    if material_name:
        features["material"] = material_name

    # Bbox ratio
    if bbox_size:
        w, h, d = bbox_size
        max_dim = max(w, h, d) or 1
        min_dim = min(w, h, d) or 0.01
        features["bbox_ratio"] = f"{w/max_dim:.1f}:{h/max_dim:.1f}:{d/max_dim:.1f}"

        # Classify shape based on aspect ratio
        aspect_ratio = max_dim / min_dim
        if aspect_ratio > 5:
            # Determine which dimension is dominant
            if h == max_dim and h / max(w, d) > 3:
                features["shape"] = "tall_thin"  # Height dominant (pole, column)
            elif min(w, d) == min_dim and max(w, d) / min(w, d) > 3:
                features["shape"] = "flat"  # Width/depth dominant (wall, plate)
            else:
                features["shape"] = "elongated"  # General elongation
        else:
            features["shape"] = "compact"  # Roughly cubic

    # Face count category
    if face_count > 0:
        if face_count < 100:
            features["detail_level"] = "low"
        elif face_count < 1000:
            features["detail_level"] = "medium"
        else:
            features["detail_level"] = "high"

    return features


def record_user_correction(
    memory: MemoryProvider,
    asset_name: str,
    asset_features: dict,
    wrong_result: str,
    correct_result: str,
    reason: str = "",
) -> str:
    """Record a user correction to memory.

    Args:
        memory: The memory provider instance.
        asset_name: Name of the corrected asset.
        asset_features: Features of the asset.
        wrong_result: What the agent incorrectly inferred.
        correct_result: The correct classification/conclusion.
        reason: User's explanation for why it's wrong.

    Returns:
        A confirmation message.
    """
    from datetime import datetime

    record = CorrectionRecord(
        asset_name=asset_name,
        asset_features=asset_features,
        wrong_result=wrong_result,
        correct_result=correct_result,
        reason=reason,
        timestamp=datetime.now().isoformat(),
    )
    memory.add_correction(record)

    # Check if compression happened
    stats = memory.get_memory_stats()
    return (
        f"已记录纠正：{asset_name} → {correct_result}\n"
        f"当前记忆状态：{stats['rule_count']} 条规则，{stats['correction_count']} 条待压缩纠正"
    )
