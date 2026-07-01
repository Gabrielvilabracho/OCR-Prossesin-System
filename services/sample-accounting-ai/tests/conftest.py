import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.main import app


GOLDEN_DIR = Path(__file__).parent / "golden"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def load_golden_cases() -> list[dict]:
    """Load all golden cases from tests/golden/case_*.json."""
    cases = []
    for path in sorted(GOLDEN_DIR.glob("case_*.json")):
        with path.open() as f:
            cases.append({"file": path.name, "data": json.load(f)})
    return cases


@pytest.fixture
def golden_cases() -> list[dict]:
    """Pytest fixture: returns all loaded golden cases."""
    return load_golden_cases()
