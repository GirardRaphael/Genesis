import pytest

from genesis.db import Store


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("GENESIS_CHECKPOINT_PATH", str(tmp_path / "checkpoints.sqlite"))
    monkeypatch.setenv("GENESIS_GLOBAL_BUDGET_CAD", "100")
    monkeypatch.setenv("GENESIS_CAD_PER_USD", "2")
    return Store(f"sqlite:///{tmp_path / 'runs.sqlite'}")
