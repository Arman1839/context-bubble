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

    provider = settings.LLM_PROVIDER.lower()
    if provider == "anthropic":
        primary = AnthropicAdapter()
        fallback = GeminiAdapter()
    else:
        primary = GeminiAdapter()
        fallback = AnthropicAdapter()

    _current_adapter = ResilientLLMAdapter(primary=primary, fallback=fallback)
    return _current_adapter

