import pytest
from fastapi.testclient import TestClient

from main import app
from app.auth import create_access_token
from app.db.engine import engine
from app.db.base import Base
from app.models.runner_profile import RunnerProfileModel  # noqa: F401


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    return TestClient(app)


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def test_post_creates_then_get_returns_own_profile(client):
    tok = create_access_token("sub-route-user-1")
    r = client.post("/api/v1/runners/profile", json={"age": 30, "weeklyDistance": "dist_20_40"}, headers=_auth(tok))
    assert r.status_code == 200
    body = r.json()
    assert body["age"] == 30
    assert body["weeklyDistance"] == "dist_20_40"
    assert "id" in body

    r2 = client.get("/api/v1/runners/profile", headers=_auth(tok))
    assert r2.status_code == 200
    assert r2.json()["id"] == body["id"]


def test_get_without_token_is_401(client):
    assert client.get("/api/v1/runners/profile").status_code in (401, 403)


def test_get_missing_profile_is_404(client):
    tok = create_access_token("sub-route-nobody")
    assert client.get("/api/v1/runners/profile", headers=_auth(tok)).status_code == 404


def test_put_partial_update(client):
    tok = create_access_token("sub-route-user-2")
    client.post("/api/v1/runners/profile", json={"age": 25, "level": "beginner"}, headers=_auth(tok))
    r = client.put("/api/v1/runners/profile", json={"level": "advanced"}, headers=_auth(tok))
    assert r.status_code == 200
    assert r.json()["age"] == 25
    assert r.json()["level"] == "advanced"


def test_bad_enum_returns_422(client):
    tok = create_access_token("sub-route-user-3")
    r = client.post("/api/v1/runners/profile", json={"surface": "highway"}, headers=_auth(tok))
    assert r.status_code == 422


def test_id_route_forbidden_for_non_owner(client):
    owner = create_access_token("sub-route-owner")
    created = client.post("/api/v1/runners/profile", json={"age": 33}, headers=_auth(owner)).json()
    other = create_access_token("sub-route-other")
    r = client.get(f"/api/v1/runners/profile/{created['id']}", headers=_auth(other))
    assert r.status_code == 403


def test_id_route_allowed_for_admin(client):
    owner = create_access_token("sub-route-owner-2")
    created = client.post("/api/v1/runners/profile", json={"age": 44}, headers=_auth(owner)).json()
    admin = create_access_token("test_admin")  # admin username from conftest
    r = client.get(f"/api/v1/runners/profile/{created['id']}", headers=_auth(admin))
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_pronation_is_client_writable_on_create(client):
    tok = create_access_token("sub-route-pron")
    r = client.post("/api/v1/runners/profile", json={"pronation": "neutral"}, headers=_auth(tok))
    assert r.status_code == 200
    assert r.json()["pronation"] == "neutral"
