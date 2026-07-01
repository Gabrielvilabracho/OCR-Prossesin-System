"""Tests for /health endpoint — version field (SO0).

TDD: RED tests written before implementation.
"""

import os
from unittest.mock import patch

from fastapi.testclient import TestClient


def test_health_returns_version_field(client: TestClient) -> None:
    """SO0: /health response includes a version field."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data


def test_health_version_matches_env_var(client: TestClient) -> None:
    """SO0: version equals APP_VERSION when env var is set."""
    with patch.dict(os.environ, {"APP_VERSION": "1.2.3"}):
        response = client.get("/health")
    data = response.json()
    assert data["version"] == "1.2.3"


def test_health_version_defaults_when_env_absent(client: TestClient) -> None:
    """SO0: version defaults to '0.1.0' when APP_VERSION is not set."""
    env_without_version = {k: v for k, v in os.environ.items() if k != "APP_VERSION"}
    with patch.dict(os.environ, env_without_version, clear=True):
        response = client.get("/health")
    data = response.json()
    assert data["version"] == "0.1.0"
