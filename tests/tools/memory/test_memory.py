"""Tests for the memory module."""

import json
import os
import tempfile
import pytest
from datetime import datetime

from tools.memory.provider import CorrectionRecord, Rule
from tools.memory.null_provider import NullMemoryProvider
from tools.memory.file_provider import FileMemoryProvider
from tools.memory.memory_tools import (
    build_memory_context,
    extract_asset_features,
    record_user_correction,
)


class TestNullMemoryProvider:
    """Tests for NullMemoryProvider."""

    def test_get_project_profile_returns_none(self):
        provider = NullMemoryProvider()
        assert provider.get_project_profile() is None

    def test_get_relevant_rules_returns_empty(self):
        provider = NullMemoryProvider()
        rules = provider.get_relevant_rules({"prefix": "SM_"}, limit=5)
        assert rules == []

    def test_add_correction_does_nothing(self):
        provider = NullMemoryProvider()
        record = CorrectionRecord(
            asset_name="test",
            asset_features={},
            wrong_result="wrong",
            correct_result="correct",
            reason="test",
            timestamp=datetime.now().isoformat(),
        )
        # Should not raise
        provider.add_correction(record)

    def test_get_memory_stats_returns_zeros(self):
        provider = NullMemoryProvider()
        stats = provider.get_memory_stats()
        assert stats["profile_chars"] == 0
        assert stats["rule_count"] == 0
        assert stats["correction_count"] == 0
        assert stats["total_tokens_estimate"] == 0


class TestFileMemoryProvider:
    """Tests for FileMemoryProvider."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for tests."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def provider(self, temp_dir):
        """Create a FileMemoryProvider with temp directory."""
        return FileMemoryProvider(temp_dir)

    def test_initialization_creates_directory(self, temp_dir):
        """Test that initialization creates the memory directory."""
        memory_dir = os.path.join(temp_dir, ".ta_agent", "memory")
        assert not os.path.exists(memory_dir)
        FileMemoryProvider(temp_dir)
        assert os.path.exists(memory_dir)

    def test_project_profile_initially_none(self, provider):
        """Test that project profile is initially None."""
        assert provider.get_project_profile() is None

    def test_update_and_get_project_profile(self, provider):
        """Test updating and retrieving project profile."""
        profile = "低多边形卡通风格，建筑用 BLD_ 前缀"
        provider.update_project_profile(profile)
        assert provider.get_project_profile() == profile

    def test_project_profile_truncation(self, provider):
        """Test that long profiles are truncated."""
        long_profile = "x" * 5000
        provider.update_project_profile(long_profile)
        result = provider.get_project_profile()
        assert len(result) <= 2000  # MAX_PROFILE_CHARS

    def test_add_correction_and_load(self, provider):
        """Test adding and loading corrections."""
        record = CorrectionRecord(
            asset_name="SM_Test_01",
            asset_features={"prefix": "SM_", "face_count": 500},
            wrong_result="building/wall",
            correct_result="weapon/sword",
            reason="太窄长了",
            timestamp=datetime.now().isoformat(),
        )
        provider.add_correction(record)

        # Verify correction was saved
        corrections = provider._load_corrections()
        assert len(corrections) == 1
        assert corrections[0]["asset_name"] == "SM_Test_01"
        assert corrections[0]["correct_result"] == "weapon/sword"

    def test_rules_initially_empty(self, provider):
        """Test that rules are initially empty."""
        rules = provider._load_rules()
        assert rules == []

    def test_get_relevant_rules_with_no_rules(self, provider):
        """Test getting relevant rules when none exist."""
        rules = provider.get_relevant_rules({"prefix": "SM_"}, limit=5)
        assert rules == []

    def test_memory_stats(self, provider):
        """Test memory statistics."""
        # Add a profile
        provider.update_project_profile("Test profile")

        # Add a correction
        record = CorrectionRecord(
            asset_name="test",
            asset_features={},
            wrong_result="wrong",
            correct_result="correct",
            reason="test",
            timestamp=datetime.now().isoformat(),
        )
        provider.add_correction(record)

        stats = provider.get_memory_stats()
        assert stats["profile_chars"] > 0
        assert stats["correction_count"] == 1
        assert stats["rule_count"] == 0


class TestMemoryTools:
    """Tests for memory tool functions."""

    def test_extract_asset_features_basic(self):
        """Test basic feature extraction."""
        features = extract_asset_features(
            asset_name="SM_WoodenTable_01",
            face_count=500,
            vertex_count=300,
        )
        assert features["name"] == "SM_WoodenTable_01"
        assert features["prefix"] == "SM"
        assert features["face_count"] == 500
        assert features["vertex_count"] == 300
        assert features["detail_level"] == "medium"

    def test_extract_asset_features_with_bbox(self):
        """Test feature extraction with bounding box."""
        features = extract_asset_features(
            asset_name="SM_Wall_01",
            bbox_size=(10.0, 3.0, 0.2),
        )
        assert "bbox_ratio" in features
        assert features["shape"] == "flat"

    def test_extract_asset_features_tall_thin(self):
        """Test feature extraction for tall thin objects."""
        features = extract_asset_features(
            asset_name="SM_Pole_01",
            bbox_size=(0.1, 5.0, 0.1),
        )
        assert features["shape"] == "tall_thin"

    def test_build_memory_context_no_memory(self):
        """Test building memory context with NullMemoryProvider."""
        provider = NullMemoryProvider()
        context = build_memory_context(provider, {"prefix": "SM_"})
        assert context is None

    def test_build_memory_context_with_profile(self):
        """Test building memory context with profile."""
        with tempfile.TemporaryDirectory() as tmpdir:
            provider = FileMemoryProvider(tmpdir)
            provider.update_project_profile("低多边形卡通风格")
            context = build_memory_context(provider, {"prefix": "SM_"})
            assert context is not None
            assert "低多边形卡通风格" in context

    def test_record_user_correction(self):
        """Test recording a user correction."""
        with tempfile.TemporaryDirectory() as tmpdir:
            provider = FileMemoryProvider(tmpdir)
            result = record_user_correction(
                memory=provider,
                asset_name="SM_Test_01",
                asset_features={"prefix": "SM_"},
                wrong_result="building/wall",
                correct_result="weapon/sword",
                reason="太窄长了",
            )
            assert "已记录纠正" in result
            assert provider.get_memory_stats()["correction_count"] == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
