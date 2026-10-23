from typing import Optional
from app.core.config import settings
from app.llm.base import LLMAdapter
from app.llm.gemini import GeminiAdapter
from app.llm.anthropic import AnthropicAdapter
from app.llm.resilient import ResilientLLMAdapter

_current_adapter: Optional[LLMAdapter] = None


def get_llm_adapter() -> LLMAdapter:
    global _current_adapter
    if _current_adapter is not None:
        return _current_adapter

    # Strictly Gemini 3.5 Flash Lite default and Gemini 3.1 Flash Lite fallback
    primary = GeminiAdapter(model_name=settings.GEMINI_MODEL)
    fallback = GeminiAdapter(model_name=settings.GEMINI_FALLBACK_MODEL) if getattr(primary, "_client", None) is not None else None
    _current_adapter = ResilientLLMAdapter(primary=primary, fallback=fallback)
    return _current_adapter

