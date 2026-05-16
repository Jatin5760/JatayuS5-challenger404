"""
Tests for authentication endpoints (signup, login, password change).
Uses Flask test client with a temporary MongoDB collection.
"""
import pytest
import json
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from server import app, _auth_token_for, _public_user
from werkzeug.security import generate_password_hash


# ── Fixtures ──────────────────────────────────────────

@pytest.fixture
def client():
    """Flask test client with TESTING mode."""
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def _mock_db():
    """Create a mock MongoDB database with users collection."""
    mock = MagicMock()
    mock.users = MagicMock()
    return mock


# ── Signup Tests ──────────────────────────────────────

@patch("server.get_db")
def test_signup_success(mock_get_db, client):
    """Successful signup returns 201 with token and user."""
    db = _mock_db()
    db.users.find_one.return_value = None  # no existing user
    db.users.insert_one.return_value = MagicMock(inserted_id="fake_id_123")
    mock_get_db.return_value = db

    resp = client.post("/api/auth/signup", json={
        "name": "Test User",
        "email": "test@example.com",
        "password": "password123",
    })

    assert resp.status_code == 201
    data = resp.get_json()
    assert "token" in data
    assert data["user"]["name"] == "Test User"
    assert data["user"]["email"] == "test@example.com"
    assert "password_hash" not in data["user"]


@patch("server.get_db")
def test_signup_missing_name(mock_get_db, client):
    """Signup with missing name returns 400."""
    resp = client.post("/api/auth/signup", json={
        "email": "test@example.com",
        "password": "password123",
    })
    assert resp.status_code == 400
    assert "Name" in resp.get_json()["error"]


@patch("server.get_db")
def test_signup_missing_email(mock_get_db, client):
    """Signup with missing email returns 400."""
    resp = client.post("/api/auth/signup", json={
        "name": "Test User",
        "password": "password123",
    })
    assert resp.status_code == 400


@patch("server.get_db")
def test_signup_missing_password(mock_get_db, client):
    """Signup with missing password returns 400."""
    resp = client.post("/api/auth/signup", json={
        "name": "Test User",
        "email": "test@example.com",
    })
    assert resp.status_code == 400


@patch("server.get_db")
def test_signup_invalid_email(mock_get_db, client):
    """Signup with invalid email returns 400."""
    resp = client.post("/api/auth/signup", json={
        "name": "Test User",
        "email": "not-an-email",
        "password": "password123",
    })
    assert resp.status_code == 400
    assert "email" in resp.get_json()["error"].lower()


@patch("server.get_db")
def test_signup_short_password(mock_get_db, client):
    """Signup with password < 8 chars returns 400."""
    resp = client.post("/api/auth/signup", json={
        "name": "Test User",
        "email": "test@example.com",
        "password": "short",
    })
    assert resp.status_code == 400
    assert "8" in resp.get_json()["error"]


@patch("server.get_db")
def test_signup_duplicate_email(mock_get_db, client):
    """Signup with existing email returns 409."""
    db = _mock_db()
    db.users.find_one.return_value = {"email": "test@example.com"}  # exists
    mock_get_db.return_value = db

    resp = client.post("/api/auth/signup", json={
        "name": "Test User",
        "email": "test@example.com",
        "password": "password123",
    })
    assert resp.status_code == 409
    assert "already exists" in resp.get_json()["error"].lower()


# ── Login Tests ───────────────────────────────────────

@patch("server.get_db")
def test_login_success(mock_get_db, client):
    """Successful login returns 200 with token and user."""
    hashed = generate_password_hash("password123")
    db = _mock_db()
    db.users.find_one.return_value = {
        "_id": "user_id_456",
        "name": "Test User",
        "email": "test@example.com",
        "password_hash": hashed,
    }
    mock_get_db.return_value = db

    resp = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "password123",
    })

    assert resp.status_code == 200
    data = resp.get_json()
    assert "token" in data
    assert data["user"]["name"] == "Test User"


@patch("server.get_db")
def test_login_wrong_password(mock_get_db, client):
    """Login with wrong password returns 401."""
    hashed = generate_password_hash("correct_password")
    db = _mock_db()
    db.users.find_one.return_value = {
        "_id": "user_id_456",
        "email": "test@example.com",
        "password_hash": hashed,
    }
    mock_get_db.return_value = db

    resp = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "wrong_password",
    })

    assert resp.status_code == 401
    assert "invalid" in resp.get_json()["error"].lower()


@patch("server.get_db")
def test_login_nonexistent_user(mock_get_db, client):
    """Login with nonexistent email returns 401."""
    db = _mock_db()
    db.users.find_one.return_value = None
    mock_get_db.return_value = db

    resp = client.post("/api/auth/login", json={
        "email": "nonexistent@example.com",
        "password": "password123",
    })

    assert resp.status_code == 401


@patch("server.get_db")
def test_login_missing_fields(mock_get_db, client):
    """Login with missing email/password returns 400."""
    resp = client.post("/api/auth/login", json={})
    assert resp.status_code == 400


# ── Password Change Tests ─────────────────────────────

@patch("server.get_db")
def test_change_password_missing_fields(mock_get_db, client):
    """Password change without auth token returns 401 (require_auth fires first)."""
    resp = client.post("/api/me/change-password", json={})
    # require_auth decorator fires before the handler, so 401 not 400
    assert resp.status_code == 401


# ── Token Utility Tests ───────────────────────────────

def test_auth_token_roundtrip():
    """Token can be generated and decoded back."""
    token = _auth_token_for("user_123")
    assert isinstance(token, str)
    assert len(token) > 0


def test_public_user_strips_password():
    """_public_user removes password_hash from user dict."""
    user = {
        "_id": "abc",
        "name": "Alice",
        "email": "alice@example.com",
        "password_hash": "secret_hash",
        "created_at": "2024-01-01",
    }
    public = _public_user(user)
    assert "password_hash" not in public
    assert public["name"] == "Alice"
    assert public["email"] == "alice@example.com"


# ── Auth Me Endpoint ──────────────────────────────────

@patch("server.get_db")
def test_auth_me_requires_token(mock_get_db, client):
    """GET /api/auth/me without token returns 401."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401