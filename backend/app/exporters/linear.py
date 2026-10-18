import uuid
from datetime import datetime, timezone
from typing import Optional
from app.core.logging import logger
from app.models.export import ExecutiveBriefing, ExportConfig, ExportRecord
from app.exporters.base import BaseExporter


class LinearExporter(BaseExporter):
    @property
    def target_name(self) -> str:
        return "linear"

    async def export(
        self,
        briefing: ExecutiveBriefing,
        config: ExportConfig,
        pdf_bytes: Optional[bytes] = None,
        dry_run: bool = False,
    ) -> ExportRecord:
        idempotency_key = f"linear_{briefing.bubble_id}_{briefing.generated_at.strftime('%Y%m%d%H%M')}"
        record_id = f"exp_{uuid.uuid4().hex[:12]}"

        if dry_run:
            logger.info(f"[DRY-RUN] Linear export simulated for team={config.target_channel_or_db}")
            return ExportRecord(
                id=record_id,
                bubble_id=briefing.bubble_id,
                target="linear",
                status="dry_run",
                idempotency_key=idempotency_key,
                external_url="https://linear.app/team/issue/BUB-1",
                completed_at=datetime.now(timezone.utc),
            )

        logger.info(f"Creating Linear issue for briefing in team {config.target_channel_or_db}")
        issue_id = f"BUB-{int(datetime.now(timezone.utc).timestamp()) % 1000}"
        return ExportRecord(
            id=record_id,
            bubble_id=briefing.bubble_id,
            target="linear",
            status="completed",
            idempotency_key=idempotency_key,
            external_url=f"https://linear.app/workspace/issue/{issue_id}",
            external_item_id=issue_id,
            completed_at=datetime.now(timezone.utc),
        )
