import base64
import json

import pytest

from app.api import deps
from app.core.config import settings


def _jwt(claims):
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"header.{payload}.signature"


@pytest.mark.anyio
async def test_dev_mode_keeps_firebase_uid_when_admin_verification_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(
        deps.fb_auth,
        "verify_id_token",
        lambda _token: (_ for _ in ()).throw(ValueError("Admin credentials unavailable")),
    )
    token = _jwt({"sub": "firebase-host-uid", "name": "Gautam Didwania", "email": "g@example.com"})

    user = await deps.get_current_user(authorization=f"Bearer {token}")

    assert user.uid == "firebase-host-uid"
    assert user.name == "Gautam Didwania"
    assert user.email == "g@example.com"


@pytest.mark.anyio
async def test_host_uid_from_firebase_token_is_authorized(monkeypatch, mock_db):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(deps, "get_async_firestore_client", lambda: mock_db)
    monkeypatch.setattr(
        deps.fb_auth,
        "verify_id_token",
        lambda _token: (_ for _ in ()).throw(ValueError("Admin credentials unavailable")),
    )
    await mock_db.collection("bubbles").document("host-pop").set({"host_id": "firebase-host-uid"})
    token = _jwt({"sub": "firebase-host-uid", "name": "Gautam Didwania"})
    user = await deps.get_current_user(authorization=f"Bearer {token}")

    host = await deps.require_bubble_host(bubble_id="host-pop", user=user)

    assert host["id"] == "firebase-host-uid"
    assert host["role"] == "host"


@pytest.mark.anyio
async def test_legacy_fallback_host_can_manage_its_existing_dev_bubble(monkeypatch, mock_db):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(deps, "get_async_firestore_client", lambda: mock_db)
    await mock_db.collection("bubbles").document("legacy-host-pop").set({
        "host_id": "dev-fallback-user",
    })

    host = await deps.require_bubble_host(
        bubble_id="legacy-host-pop",
        user=deps.AuthenticatedUser(uid="firebase-host-uid", name="Gautam Didwania"),
    )

    assert host["id"] == "firebase-host-uid"
    assert host["role"] == "host"
