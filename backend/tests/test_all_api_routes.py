import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.firebase import get_async_firestore_client
from app.core.config import settings


@pytest.fixture(autouse=True)
def setup_test_env():
    settings.ENVIRONMENT = "test"


@pytest.mark.anyio
async def test_all_api_endpoints_comprehensive():
    """
    Comprehensive end-to-end API test covering:
    - Health & readiness endpoints
    - Bubble creation, retrieval, and extension
    - Host & participant role checks
    - AI trigger-mode updates
    - Multi-user messaging & anonymous messaging
    - Presence updates
    - Knowledge graph retrieval
    - Direct multipart file upload & indexing
    - File listing
    - Pop export target configuration
    - Pop status lifecycle & executive briefing generation
    - Cloud Task sweeper execution
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # ── 1. Health Endpoints ───────────────────────────────────────────
        res = await client.get("/")
        assert res.status_code == 200
        assert res.json()["status"] == "operational"

        res = await client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

        res = await client.get("/api/v1/health/liveness")
        assert res.status_code == 200
        assert res.json()["status"] == "live"

        res = await client.get("/api/v1/health/readiness")
        assert res.status_code == 200
        assert res.json()["status"] == "ready"

        # ── 2. Create Bubble ─────────────────────────────────────────────
        host_headers = {"Authorization": "Bearer dev-host-alice"}
        create_payload = {
            "title": "Architecture Review 2026",
            "duration_minutes": 45,
            "retention_policy": "temporary",
            "anonymous_mode_enabled": True,
            "trigger_mode": "auto",
            "token_budget": 100000,
            "e2ee_enabled": False,
        }
        res = await client.post("/api/v1/bubbles", json=create_payload, headers=host_headers)
        assert res.status_code == 201, res.text
        bubble_data = res.json()
        bubble_id = bubble_data["id"]
        assert bubble_data["title"] == "Architecture Review 2026"
        assert bubble_data["pop_state"] == "ACTIVE"
        assert bubble_data["member_count"] == 1
        assert bubble_data["host_id"] == "host-alice"

        # ── 3. Get Bubble ────────────────────────────────────────────────
        res = await client.get(f"/api/v1/bubbles/{bubble_id}", headers=host_headers)
        assert res.status_code == 200
        assert res.json()["id"] == bubble_id

        # ── 4. Join Bubble (Participant Bob) ─────────────────────────────
        bob_headers = {"Authorization": "Bearer dev-participant-bob"}
        join_payload = {
            "display_name": "Bob the Builder",
            "avatar_url": "https://api.dicebear.com/9.x/notionists/svg?seed=bob",
        }
        res = await client.post(f"/api/v1/bubbles/{bubble_id}/join", json=join_payload, headers=bob_headers)
        assert res.status_code == 200, res.text
        member_data = res.json()
        assert member_data["name"] == "Bob the Builder"
        assert member_data["role"] == "participant"

        # Verify member count incremented
        res = await client.get(f"/api/v1/bubbles/{bubble_id}", headers=host_headers)
        assert res.json()["member_count"] == 2

        # ── 5. Host Actions: Update Trigger Mode & Extend ─────────────────
        res = await client.patch(
            f"/api/v1/bubbles/{bubble_id}/trigger-mode",
            json={"trigger_mode": "always"},
            headers=host_headers,
        )
        assert res.status_code == 200
        assert res.json()["trigger_mode"] == "always"

        res = await client.post(
            f"/api/v1/bubbles/{bubble_id}/extend",
            json={"additional_minutes": 15},
            headers=host_headers,
        )
        assert res.status_code == 200
        assert res.json()["status"] == "extended"

        # ── 6. Messaging: Post & List Messages ────────────────────────────
        # Host message
        res = await client.post(
            f"/api/v1/bubbles/{bubble_id}/messages",
            json={"text": "Welcome to our ephemeral review session!"},
            headers=host_headers,
        )
        assert res.status_code == 201, res.text
        msg1 = res.json()
        assert msg1["text"] == "Welcome to our ephemeral review session!"
        assert msg1["author_id"] == "host-alice"
        assert msg1["seq"] == 1

        # Participant message (anonymous)
        res = await client.post(
            f"/api/v1/bubbles/{bubble_id}/messages",
            json={"text": "I think we should migrate to PostgreSQL.", "is_anonymous": True},
            headers=bob_headers,
        )
        assert res.status_code == 201, res.text
        msg2 = res.json()
        assert msg2["is_anonymous"] is True
        assert msg2["author_name"] == "Anonymous"
        assert msg2["seq"] == 2

        # List messages
        res = await client.get(f"/api/v1/bubbles/{bubble_id}/messages", headers=host_headers)
        assert res.status_code == 200
        messages = res.json()
        assert len(messages) >= 2
        assert messages[0]["seq"] == 1
        assert messages[1]["seq"] == 2

        # ── 7. Presence Updates ──────────────────────────────────────────
        res = await client.post(
            f"/api/v1/bubbles/{bubble_id}/messages/presence?is_typing=true&status=online",
            headers=bob_headers,
        )
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

        # ── 8. Knowledge Graph ────────────────────────────────────────────
        res = await client.get(f"/api/v1/bubbles/{bubble_id}/graph", headers=host_headers)
        assert res.status_code == 200
        graph_data = res.json()
        assert "nodes" in graph_data
        assert "edges" in graph_data

        # ── 9. Direct File Upload & Listing ──────────────────────────────
        file_content = b"Database migration RFC: We propose moving to distributed CockroachDB."
        files = {
            "file": ("rfc_migration.txt", file_content, "text/plain")
        }
        res = await client.post(
            f"/api/v1/bubbles/{bubble_id}/files/upload",
            files=files,
            headers=host_headers,
        )
        assert res.status_code == 200, res.text
        upload_resp = res.json()
        assert upload_resp["filename"] == "rfc_migration.txt"
        assert upload_resp["status"] == "uploaded_and_indexed"
        assert upload_resp["char_count"] > 0

        # List files
        res = await client.get(f"/api/v1/bubbles/{bubble_id}/files", headers=host_headers)
        assert res.status_code == 200
        file_list = res.json()
        assert len(file_list) >= 1
        assert file_list[0]["filename"] == "rfc_migration.txt"

        # ── 10. Pop Configuration & Status ────────────────────────────────
        res = await client.post(
            f"/api/v1/bubbles/{bubble_id}/pop/export-config",
            json={"target": "markdown", "enabled": True},
            headers=host_headers,
        )
        assert res.status_code == 200
        assert res.json()["status"] == "configured"

        res = await client.get(f"/api/v1/bubbles/{bubble_id}/pop/status", headers=host_headers)
        assert res.status_code == 200
        status_data = res.json()
        assert status_data["pop_state"] == "ACTIVE"

        # ── 11. Initiate Pop (Dry Run) ────────────────────────────────────
        res = await client.post(
            f"/api/v1/bubbles/{bubble_id}/pop",
            json={"dry_run": True, "custom_briefing_prompt": "Focus on database decisions."},
            headers=host_headers,
        )
        assert res.status_code == 200, res.text
        pop_res = res.json()
        assert pop_res["pop_state"] == "ACTIVE"

        # Dry-run must preserve the active session.
        res = await client.get(f"/api/v1/bubbles/{bubble_id}/pop/status", headers=host_headers)
        assert res.status_code == 200
        assert res.json()["pop_state"] == "ACTIVE"

        # Fetch Executive Briefing
        res = await client.get(f"/api/v1/bubbles/{bubble_id}/pop/briefing", headers=host_headers)
        assert res.status_code == 200, res.text
        briefing = res.json()
        assert "executive_summary" in briefing
        assert briefing["bubble_id"] == bubble_id

        # ── 12. Sweeper Task ──────────────────────────────────────────────
        res = await client.post(
            f"/api/v1/bubbles/{bubble_id}/pop/tasks/sweeper",
            headers={"X-Server-Internal-Secret": settings.SERVER_INTERNAL_SECRET},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "sweeper_completed"
