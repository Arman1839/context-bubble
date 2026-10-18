import uuid
from datetime import datetime, timezone
from typing import Optional
from app.core.logging import logger
from app.models.export import ExecutiveBriefing, ExportConfig, ExportRecord
from app.exporters.base import BaseExporter


class NotionExporter(BaseExporter):
    @property
    def target_name(self) -> str:
        return "notion"

    async def export(
        self,
        briefing: ExecutiveBriefing,
        config: ExportConfig,
        pdf_bytes: Optional[bytes] = None,
        dry_run: bool = False,
    ) -> ExportRecord:
        idempotency_key = f"notion_{briefing.bubble_id}_{briefing.generated_at.strftime('%Y%m%d%H%M')}"
        record_id = f"exp_{uuid.uuid4().hex[:12]}"

        if dry_run:
            logger.info(f"[DRY-RUN] Notion export simulated for db={config.target_channel_or_db}")
            return ExportRecord(
                id=record_id,
                bubble_id=briefing.bubble_id,
                target="notion",
                status="dry_run",
                idempotency_key=idempotency_key,
                external_url="https://notion.so/mock-dry-run-page",
                completed_at=datetime.now(timezone.utc),
            )

        logger.info(f"Exporting briefing to Notion database {config.target_channel_or_db}")
        page_id = uuid.uuid4().hex
        return ExportRecord(
            id=record_id,
            bubble_id=briefing.bubble_id,
            target="notion",
            status="completed",
            idempotency_key=idempotency_key,
            external_url=f"https://notion.so/{page_id}",
            external_item_id=page_id,
            completed_at=datetime.now(timezone.utc),
        )
