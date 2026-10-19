"""
Seed script to load frontend lib/sample-data.ts schema into Firestore.
Usage:
    python backend/scripts/seed_demo.py
"""
import asyncio
from datetime import datetime, timezone, timedelta
from google.cloud import firestore
import sys
import os

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.firebase import get_async_firestore_client
from app.rag.pipeline import RAGPipeline
from app.llm.factory import get_llm_adapter
from app.graph.service import GraphService
from app.models.insight import Insight


async def seed_demo():
    print("[*] Connecting to Firestore to seed 'demo' bubble...")
    db = get_async_firestore_client()
    llm = get_llm_adapter()
    rag = RAGPipeline(db, llm)
    graph_svc = GraphService(db)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=2, minutes=14)

    bubble_id = "demo"
    bubble_ref = db.collection("bubbles").document(bubble_id)

    # 1. Root Bubble Document
    bubble_data = {
        "id": bubble_id,
        "title": "Pivot Decision – Oct 2026",
        "is_live": True,
        "expires_at": expires_at,
        "member_count": 6,
        "retention_policy": "temporary-plus-record",
        "anonymous_mode_enabled": False,
        "host_id": "priya",
        "pop_state": "ACTIVE",
        "trigger_mode": "mention",
        "token_budget": 250000,
        "tokens_used": 1420,
        "last_seq": 5,
        "created_at": now - timedelta(minutes=15),
        "updated_at": now,
    }
    await bubble_ref.set(bubble_data)
    print("[+] Created root bubble document")

    # 2. Participants
    members = [
        {"id": "priya", "name": "Priya", "avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=priya&backgroundColor=b6e3f4", "role": "host"},
        {"id": "arjun", "name": "Arjun", "avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=arjun&backgroundColor=c0aede", "role": "participant"},
        {"id": "meera", "name": "Meera", "avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=meera&backgroundColor=ffdfbf", "role": "participant"},
        {"id": "sara", "name": "Sara", "avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=sara&backgroundColor=d1f4d9", "role": "participant"},
        {"id": "rahul", "name": "Rahul", "avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=rahul&backgroundColor=ffd5dc", "role": "participant"},
        {"id": "ananya", "name": "Ananya", "avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=ananya&backgroundColor=c9e9d2", "role": "participant"},
    ]
    for m in members:
        await bubble_ref.collection("participants").document(m["id"]).set({
            **m,
            "joined_at": now - timedelta(minutes=12),
            "last_seen_at": now,
        })
    print(f"[+] Seeded {len(members)} participants")

    # 3. Contributions and Messages
    contributions = [
        {
            "id": "c1",
            "seq": 1,
            "author_id": "priya",
            "author_name": "Priya",
            "author_avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=priya&backgroundColor=b6e3f4",
            "is_anonymous": False,
            "text": "Retention dropped 18% after the last update. Users say onboarding is confusing.",
            "timestamp": now - timedelta(minutes=9),
        },
        {
            "id": "c2",
            "seq": 2,
            "author_id": "arjun",
            "author_name": "Arjun",
            "author_avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=arjun&backgroundColor=c0aede",
            "is_anonymous": False,
            "text": "I still think pricing is the real issue. Our competitor charges 40% less.",
            "timestamp": now - timedelta(minutes=7),
            "attachments": [{"type": "link", "label": "Competitor X - pricing - 40% less"}],
        },
        {
            "id": "c3",
            "seq": 3,
            "author_id": "meera",
            "author_name": "Meera",
            "author_avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=meera&backgroundColor=ffdfbf",
            "is_anonymous": False,
            "text": "We have only three weeks of runway left if we don't decide this week.",
            "timestamp": now - timedelta(minutes=5),
        },
        {
            "id": "c4",
            "seq": 4,
            "author_id": "anon-1",
            "author_name": "Anonymous",
            "author_avatar": None,
            "is_anonymous": True,
            "text": "Customer quotes from the last 10 calls all mention too many steps to get value.",
            "timestamp": now - timedelta(minutes=3),
        },
        {
            "id": "c5",
            "seq": 5,
            "author_id": "sara",
            "author_name": "Sara",
            "author_avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=sara&backgroundColor=d1f4d9",
            "is_anonymous": False,
            "text": "I'm worried about team morale if we pivot again so soon.",
            "timestamp": now - timedelta(minutes=1),
        },
    ]

    for c in contributions:
        # Save to messages
        await bubble_ref.collection("messages").document(c["id"]).set({
            "id": c["id"],
            "bubble_id": bubble_id,
            "seq": c["seq"],
            "type": "user",
            "author_id": c["author_id"],
            "author_name": c["author_name"],
            "author_avatar": c.get("author_avatar"),
            "is_anonymous": c["is_anonymous"],
            "text": c["text"],
            "attachments": c.get("attachments"),
            "created_at": c["timestamp"],
        })
        # Save to contributions
        await bubble_ref.collection("contributions").document(c["id"]).set({
            "id": c["id"],
            "bubble_id": bubble_id,
            "author_id": c["author_id"],
            "author_name": c["author_name"],
            "author_avatar": c.get("author_avatar"),
            "is_anonymous": c["is_anonymous"],
            "text": c["text"],
            "attachments": c.get("attachments"),
            "timestamp": c["timestamp"],
            "source_type": "chat",
        })
        # Index in RAG vector store
        await rag.ingest_and_index(
            bubble_id=bubble_id,
            source_id=c["id"],
            text=c["text"],
            extra_metadata={"author": c["author_name"]}
        )

    print(f"[+] Seeded and vector-indexed {len(contributions)} contributions")

    # 4. Intelligence Document
    raw_insights = [
        Insight(
            insight_id="ins_1",
            type="debate",
            text="Pricing vs Onboarding complexity: Team divided on whether 40% competitor discount or onboarding friction drives 18% churn.",
            confidence=0.92,
            supporting_contribution_ids=["c1", "c2", "c4"]
        ),
        Insight(
            insight_id="ins_2",
            type="blocker",
            text="Runway limit: 3 weeks remaining until decision window closes.",
            confidence=0.98,
            supporting_contribution_ids=["c3"]
        ),
        Insight(
            insight_id="ins_3",
            type="consensus",
            text="Retention drop (18%) is critical and must be solved immediately.",
            confidence=0.95,
            supporting_contribution_ids=["c1", "c3"]
        )
    ]

    intel_data = {
        "summary": "The team agrees retention is a major concern but remains divided over whether pricing, onboarding, or product value is the primary cause. Runway pressure makes the decision time-sensitive. Current churn data has not yet been shared.",
        "disagreements": [
            {
                "id": "d1",
                "sideA": {"count": 3, "label": "retention and onboarding"},
                "sideB": {"count": 2, "label": "pricing"},
            }
        ],
        "missingPieces": [
            {
                "id": "mp1",
                "description": "Latest churn & retention data not uploaded",
                "action": "request",
                "actionLabel": "Request data",
            },
            {
                "id": "mp2",
                "description": "No agreed next experiment proposed",
                "action": "suggest",
                "actionLabel": "Suggest experiment",
            },
        ],
        "nextSteps": [
            "Upload recent retention data",
            "Compare onboarding completion rates",
        ],
        "raw_insights": [i.model_dump(mode="json") for i in raw_insights],
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    await bubble_ref.collection("intelligence").document("latest").set(intel_data)
    print("[+] Seeded intelligence summary and insights")

    # 5. Knowledge Graph
    await graph_svc.update_graph_from_insights(bubble_id, raw_insights)
    print("[+] Seeded React Flow knowledge graph")

    print("\n[SUCCESS] Seed complete! Bubble 'demo' is ready at /api/v1/bubbles/demo")


if __name__ == "__main__":
    asyncio.run(seed_demo())
