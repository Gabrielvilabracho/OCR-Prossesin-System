from fastapi.testclient import TestClient


def test_health_returns_200(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200


def test_health_returns_ok_status(client: TestClient) -> None:
    response = client.get("/health")
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "sample-accounting-ai"
