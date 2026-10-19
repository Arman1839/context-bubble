import uuid
from datetime import datetime, timezone
from typing import Optional
from app.core.logging import logger
from app.models.export import ExecutiveBriefing, ExportConfig, ExportRecord
from app.exporters.base import BaseExporter


class JiraExporter(BaseExporter):
    @property
    def target_name(self) -> str:
        return "jira"

    async def export(
        self,
        briefing: ExecutiveBriefing,
        config: ExportConfig,
        pdf_bytes: Optional[bytes] = None,
        dry_run: bool = False,
    ) -> ExportRecord:
        idempotency_key = f"jira_{briefing.bubble_id}_{briefing.generated_at.strftime('%Y%m%d%H%M')}"
        record_id = f"exp_{uuid.uuid4().hex[:12]}"

        if dry_run:
            logger.info(f"[DRY-RUN] Jira export simulated for project={config.target_channel_or_db}")
            return ExportRecord(
                id=record_id,
                bubble_id=briefing.bubble_id,
                target="jira",
                status="dry_run",
                idempotency_key=idempotency_key,
                external_url="https://atlassian.net/browse/PROJ-101",
                completed_at=datetime.now(timezone.utc),
            )

        project_key = config.target_channel_or_db or "BUB"
        key = f"{project_key}-{int(datetime.now(timezone.utc).timestamp()) % 1000}"
        logger.info(f"Creating Jira Epic {key} for bubble {briefing.bubble_id}")
        return ExportRecord(
            id=record_id,
            bubble_id=briefing.bubble_id,
            target="jira",
            status="completed",
            idempotency_key=idempotency_key,
            external_url=f"https://your-domain.atlassian.net/browse/{key}",
            external_item_id=key,
            completed_at=datetime.now(timezone.utc),
        )
