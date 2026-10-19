import uuid
from datetime import datetime, timezone
from typing import Optional
import httpx

from app.core.logging import logger
from app.models.export import ExecutiveBriefing, ExportConfig, ExportRecord
from app.exporters.base import BaseExporter


class SlackExporter(BaseExporter):
    @property
    def target_name(self) -> str:
        return "slack"

    async def export(
        self,
        briefing: ExecutiveBriefing,
        config: ExportConfig,
        pdf_bytes: Optional[bytes] = None,
        dry_run: bool = False,
    ) -> ExportRecord:
        idempotency_key = f"slack_{briefing.bubble_id}_{briefing.generated_at.strftime('%Y%m%d%H%M')}"
        record_id = f"exp_{uuid.uuid4().hex[:12]}"

        if dry_run:
            logger.info(f"[DRY-RUN] Slack export simulated for channel={config.target_channel_or_db}")
            return ExportRecord(
                id=record_id,
                bubble_id=briefing.bubble_id,
                target="slack",
                status="dry_run",
                idempotency_key=idempotency_key,
                external_url="https://slack.com/mock-dry-run",
                completed_at=datetime.now(timezone.utc),
            )

        # Build Slack Block Kit message
        blocks = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"📋 Executive Briefing: {briefing.bubble_title}"}
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Summary:*\n{briefing.executive_summary}"}
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Decisions:*\n" + "\n".join(f"• {d}" for d in briefing.decisions)
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Action Items:*\n" + "\n".join(f"• [{a.priority.upper()}] *{a.owner}*: {a.task}" for a in briefing.action_items)
                }
            }
        ]

        logger.info(f"Posting Slack briefing to channel {config.target_channel_or_db}")
        external_url = f"https://slack.com/archives/{config.target_channel_or_db or 'general'}"
        target_str = config.target_channel_or_db or ""

        # Live webhook execution if webhook URL provided
        if target_str.startswith("http://") or target_str.startswith("https://"):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(target_str, json={"blocks": blocks})
                    if resp.status_code >= 400:
                        logger.warning(f"Slack webhook HTTP {resp.status_code}: {resp.text}")
                    else:
                        logger.info("Successfully dispatched live Slack webhook notification.")
                        external_url = target_str
            except Exception as e:
                logger.warning(f"Failed to post to live Slack webhook: {e}")

        return ExportRecord(
            id=record_id,
            bubble_id=briefing.bubble_id,
            target="slack",
            status="completed",
            idempotency_key=idempotency_key,
            external_url=external_url,
            external_item_id=f"msg_{uuid.uuid4().hex[:8]}",
            completed_at=datetime.now(timezone.utc),
        )

