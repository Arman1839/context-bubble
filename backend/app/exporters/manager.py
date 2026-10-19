import asyncio
from typing import List, Dict, Optional
from app.core.firestore_compat import firestore

from app.core.logging import logger
from app.models.export import ExecutiveBriefing, ExportConfig, ExportRecord
from app.exporters.base import BaseExporter
from app.exporters.slack import SlackExporter
from app.exporters.notion import NotionExporter
from app.exporters.linear import LinearExporter
from app.exporters.jira import JiraExporter


class ExportManager:
    def __init__(self, db: firestore.AsyncClient):
        self.db = db
        self._exporters: Dict[str, BaseExporter] = {
            "slack": SlackExporter(),
            "notion": NotionExporter(),
            "linear": LinearExporter(),
            "jira": JiraExporter(),
        }

    async def execute_all_exports(
        self,
        briefing: ExecutiveBriefing,
        configs: List[ExportConfig],
        pdf_bytes: Optional[bytes] = None,
        dry_run: bool = False,
    ) -> List[ExportRecord]:
        tasks = []
        for cfg in configs:
            if not cfg.enabled:
                continue
            exporter = self._exporters.get(cfg.target)
            if not exporter:
                logger.warning(f"No exporter found for target {cfg.target}")
                continue
            tasks.append(exporter.export(briefing, cfg, pdf_bytes=pdf_bytes, dry_run=dry_run))

        if not tasks:
            return []

        records = await asyncio.gather(*tasks, return_exceptions=False)

        # Store export records in Firestore under /bubbles/{id}/exports/{export_id}
        bubble_ref = self.db.collection("bubbles").document(briefing.bubble_id)
        for r in records:
            doc_ref = bubble_ref.collection("exports").document(r.id)
            await doc_ref.set(r.model_dump(mode="json"))

        return records
