from abc import ABC, abstractmethod
from typing import Optional
from app.models.export import ExecutiveBriefing, ExportConfig, ExportRecord


class BaseExporter(ABC):
    @property
    @abstractmethod
    def target_name(self) -> str:
        pass

    @abstractmethod
    async def export(
        self,
        briefing: ExecutiveBriefing,
        config: ExportConfig,
        pdf_bytes: Optional[bytes] = None,
        dry_run: bool = False,
    ) -> ExportRecord:
        """Exports the briefing to the external system with idempotency protection."""
        pass
