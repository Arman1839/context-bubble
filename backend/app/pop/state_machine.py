from datetime import datetime, timezone
from typing import Optional, List
from app.core.firestore_compat import firestore

from app.core.logging import logger
from app.models.bubble import PopState
from app.models.export import ExecutiveBriefing, ExportConfig, ExportRecord, PopBubbleRequest
from app.models.usage import ShredReceipt
from app.llm.factory import get_llm_adapter
from app.pop.briefing_generator import BriefingGenerator
from app.exporters.manager import ExportManager
from app.crypto.shredder import CryptoShredder
from app.intelligence.stream_manager import stream_manager


class PopStateMachine:
    """
    Idempotent, transactional state machine governing the bubble destruction lifecycle:
    ACTIVE -> POPPING -> EXPORTING -> SHREDDING -> POPPED (or FAILED_EXPORT).
    Ensures data is NEVER shredded prior to verified export completion unless explicitly forced.
    """

    def __init__(self, db: firestore.AsyncClient):
        self.db = db
        self.llm = get_llm_adapter()
        self.briefing_gen = BriefingGenerator(self.llm)
        self.export_mgr = ExportManager(db)
        self.shredder = CryptoShredder(db)

    async def initiate_pop(
        self,
        bubble_id: str,
        actor_id: str,
        req: Optional[PopBubbleRequest] = None,
        is_timer_expiry: bool = False,
    ) -> str:
        # pyrefly: ignore[missing-attribute]
        bubble_ref = self.db.collection("bubbles").document(bubble_id)
        req = req or PopBubbleRequest()

        # Determine the pop reason for display
        pop_reason = "timer_expired" if is_timer_expiry else "host_action"

        # Step 1: Atomic state transition ACTIVE -> POPPING
        @firestore.async_transactional
        async def _transition_to_popping(transaction: firestore.AsyncTransaction) -> dict:
            snap = await bubble_ref.get(transaction=transaction)
            if not snap.exists:
                raise ValueError(f"Bubble {bubble_id} does not exist.")
            data = snap.to_dict() or {}
            cur_state = data.get("pop_state", "ACTIVE")

            if cur_state != "ACTIVE" and cur_state != "FAILED_EXPORT":
                logger.info(f"Pop already in progress for {bubble_id}: state={cur_state}")
                return data

            # pyrefly: ignore[missing-attribute]
            transaction.update(bubble_ref, {
                "pop_state": "POPPING",
                "is_live": False,
                "pop_reason": pop_reason,
                "updated_at": firestore.SERVER_TIMESTAMP,
            })
            data["pop_state"] = "POPPING"
            return data

        # pyrefly: ignore[missing-attribute]
        tx = self.db.transaction()
        bubble_data = await _transition_to_popping(tx)
        cur_state = bubble_data.get("pop_state")
        if cur_state not in ("POPPING", "FAILED_EXPORT"):
            return cur_state

        # Read retention policy from bubble data
        retention_policy = bubble_data.get("retention_policy", "temporary")

        # Broadcast popping event with reason + retention info to all connected members
        await stream_manager.broadcast(
            bubble_id=bubble_id,
            event_type="delta",
            data={
                "type": "pop_state_change",
                "status": "POPPING",
                "pop_reason": pop_reason,
                "retention_policy": retention_policy,
            }
        )

        # Step 2: Assemble session transcript for Executive Briefing
        msgs_snap = await (
            bubble_ref.collection("messages")
            .order_by("seq", direction=firestore.Query.ASCENDING)
            .get()
        )
        transcript_lines = []
        for m in msgs_snap:
            m_data = m.to_dict() or {}
            author = "Anonymous" if m_data.get("is_anonymous") else m_data.get("author_name", "User")
            transcript_lines.append(f"[{author}]: {m_data.get('text', '')}")
        session_text = "\n".join(transcript_lines)

        logger.info(f"Generating Executive Briefing for bubble {bubble_id}")
        briefing = await self.briefing_gen.generate_briefing(
            bubble_id=bubble_id,
            bubble_title=bubble_data.get("title", "Deliberation Session"),
            session_text=session_text,
            custom_instructions=req.custom_briefing_prompt,
        )
        pdf_bytes = self.briefing_gen.render_pdf(briefing)

        # Persist the briefing to Firestore so the frontend can fetch it after pop
        try:
            await bubble_ref.collection("briefing").document("latest").set(
                briefing.model_dump(mode="json")
            )
        except Exception as e:
            logger.warning(f"Could not persist briefing for {bubble_id}: {e}")

        # Step 3: Transition to EXPORTING
        await bubble_ref.update({"pop_state": "EXPORTING"})
        await stream_manager.broadcast(
            bubble_id=bubble_id,
            event_type="delta",
            data={
                "type": "pop_state_change",
                "status": "EXPORTING",
                "pop_reason": pop_reason,
                "retention_policy": retention_policy,
            }
        )

        # Load export configurations
        export_configs_snap = await bubble_ref.collection("export_configs").get()
        export_configs: List[ExportConfig] = []
        for doc in export_configs_snap:
            export_configs.append(ExportConfig(**doc.to_dict()))

        # Default fallback: export to Slack or dry-run if no external targets configured
        if not export_configs:
            export_configs.append(ExportConfig(target="slack", enabled=True, target_channel_or_db="general"))

        logger.info(f"Executing {len(export_configs)} exports for bubble {bubble_id}")
        records = await self.export_mgr.execute_all_exports(
            briefing=briefing,
            configs=export_configs,
            pdf_bytes=pdf_bytes,
            dry_run=req.dry_run,
        )

        all_successful = all(r.status in ("completed", "dry_run") for r in records)

        # Step 4: Verification before shredding
        if not all_successful and not req.force_shred_on_export_failure:
            logger.error(f"One or more exports failed for bubble {bubble_id}. Transitioning to FAILED_EXPORT.")
            await bubble_ref.update({
                "pop_state": "FAILED_EXPORT",
                "failed_export_reason": "External destination export failed",
            })
            await stream_manager.broadcast(
                bubble_id=bubble_id,
                event_type="delta",
                data={"type": "pop_state_change", "status": "FAILED_EXPORT", "pop_reason": pop_reason}
            )
            return "FAILED_EXPORT"

        # Step 5: Retention-policy-aware shredding
        if retention_policy == "permanent":
            # Permanent: keep ALL data, just mark as POPPED — no shredding
            logger.info(f"Bubble {bubble_id} has permanent retention — skipping shredding, keeping all data.")
            await bubble_ref.update({
                "pop_state": "POPPED",
                "popped_at": firestore.SERVER_TIMESTAMP,
                "pop_reason": pop_reason,
                "retention_policy": retention_policy,
            })
            await stream_manager.broadcast(
                bubble_id=bubble_id,
                event_type="delta",
                data={
                    "type": "pop_state_change",
                    "status": "POPPED",
                    "pop_reason": pop_reason,
                    "retention_policy": retention_policy,
                    "message": "Session ended. All data is retained for permanent reference.",
                }
            )
            return "POPPED"

        # For temporary and temporary-plus-record: proceed to SHREDDING
        await bubble_ref.update({"pop_state": "SHREDDING"})
        await stream_manager.broadcast(
            bubble_id=bubble_id,
            event_type="delta",
            data={
                "type": "pop_state_change",
                "status": "SHREDDING",
                "pop_reason": pop_reason,
                "retention_policy": retention_policy,
            }
        )

        receipt: ShredReceipt = await self.shredder.execute_shredding(
            bubble_id=bubble_id,
            host_id=bubble_data.get("host_id", actor_id),
            retention_policy=retention_policy,
        )

        # Build appropriate message based on retention policy
        if retention_policy == "temporary-plus-record":
            pop_message = "Session data has been shredded. Executive briefing and export records are retained."
        else:
            pop_message = "All session data has been permanently crypto-shredded."

        await stream_manager.broadcast(
            bubble_id=bubble_id,
            event_type="delta",
            data={
                "type": "pop_state_change",
                "status": "POPPED",
                "receipt_id": receipt.receipt_id,
                "pop_reason": pop_reason,
                "retention_policy": retention_policy,
                "message": pop_message,
            }
        )

        return "POPPED"
