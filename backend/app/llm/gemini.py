import asyncio
import json
from typing import AsyncIterator, List, Optional, Type, TypeVar
from pydantic import BaseModel
try:
    # pyrefly: ignore[missing-import]
    from google import genai
    from google.genai import types
    HAS_GENAI = True
except ImportError:
    genai = None
    types = None
    HAS_GENAI = False

from app.core.config import settings
from app.core.logging import logger
from app.llm.base import LLMAdapter, LLMResponse

T = TypeVar("T", bound=BaseModel)

# How many times to retry on 503 UNAVAILABLE before giving up
_RETRY_ATTEMPTS = 4
_RETRY_DELAY_SECONDS = 3.0

async def _with_retry(coro_fn, label: str = "Gemini call"):
    """Retry an async coroutine on 503 UNAVAILABLE errors."""
    last_exc = None
    for attempt in range(_RETRY_ATTEMPTS):
        try:
            return await coro_fn()
        except Exception as e:
            msg = str(e)
            if "503" in msg or "UNAVAILABLE" in msg:
                wait = _RETRY_DELAY_SECONDS * (attempt + 1)
                logger.warning(f"{label} got 503, retrying in {wait:.0f}s (attempt {attempt+1}/{_RETRY_ATTEMPTS})")
                await asyncio.sleep(wait)
                last_exc = e
            else:
                raise
    raise last_exc


class GeminiAdapter(LLMAdapter):
    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        embedding_model: Optional[str] = None,
    ):
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._model_name = model_name or settings.GEMINI_MODEL
        self._embedding_model = embedding_model or settings.GEMINI_EMBEDDING_MODEL

        if HAS_GENAI and self._api_key and not self._api_key.startswith("AIzaSyFake"):
            self._client = genai.Client(api_key=self._api_key)
        else:
            self._client = None
            logger.info("GeminiAdapter initialized in mock/local fallback mode")

    @property
    def model_name(self) -> str:
        return self._model_name

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        response_schema: Optional[Type[T]] = None,
    ) -> LLMResponse:
        if not self._client:
            # Fallback mock for local unit tests without real API key
            content = self._mock_generate(prompt, response_schema)
            parsed = response_schema.model_validate_json(content) if response_schema else None
            return LLMResponse(
                content=content,
                parsed=parsed,
                prompt_tokens=len(prompt) // 4,
                completion_tokens=len(content) // 4,
                total_tokens=(len(prompt) + len(content)) // 4,
                model=self._model_name,
            )

        config_dict = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
        }
        if system_prompt:
            config_dict["system_instruction"] = system_prompt
        if response_schema:
            config_dict["response_mime_type"] = "application/json"
            try:
                schema = response_schema.model_json_schema()
                def _strip_defaults(obj):
                    if isinstance(obj, dict):
                        obj.pop("default", None)
                        for v in obj.values():
                            _strip_defaults(v)
                    elif isinstance(obj, list):
                        for item in obj:
                            _strip_defaults(item)
                    return obj
                clean_schema = _strip_defaults(schema)
                config_dict["response_schema"] = clean_schema
            except Exception:
                config_dict["response_schema"] = response_schema

        config = types.GenerateContentConfig(**config_dict)

        response = await _with_retry(
            lambda: self._client.aio.models.generate_content(
                model=self._model_name,
                contents=prompt,
                config=config,
            ),
            label=f"Gemini generate ({self._model_name})"
        )

        content = response.text or ""
        parsed = None
        if response_schema:
            try:
                parsed = response_schema.model_validate_json(content)
            except Exception as e:
                logger.error(f"Failed to parse structured output from Gemini: {e}")

        usage = getattr(response, "usage_metadata", None)
        prompt_tokens = getattr(usage, "prompt_token_count", len(prompt) // 4)
        candidate_tokens = getattr(usage, "candidates_token_count", len(content) // 4)

        return LLMResponse(
            content=content,
            parsed=parsed,
            prompt_tokens=prompt_tokens or 0,
            completion_tokens=candidate_tokens or 0,
            total_tokens=(prompt_tokens or 0) + (candidate_tokens or 0),
            model=self._model_name,
        )

    async def stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> AsyncIterator[str]:
        if not self._client:
            mock_tokens = ["Hello ", "from ", "Bubble ", "AI. ", "I ", "am ", "analyzing ", "your ", "session."]
            for token in mock_tokens:
                yield token
            return

        config_dict = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
        }
        if system_prompt:
            config_dict["system_instruction"] = system_prompt

        config = types.GenerateContentConfig(**config_dict)

        # Retry on 503 by re-requesting the full stream
        for attempt in range(_RETRY_ATTEMPTS):
            try:
                async for chunk in await self._client.aio.models.generate_content_stream(
                    model=self._model_name,
                    contents=prompt,
                    config=config,
                ):
                    if chunk.text:
                        yield chunk.text
                return  # stream completed successfully
            except Exception as e:
                msg = str(e)
                if ("503" in msg or "UNAVAILABLE" in msg) and attempt < _RETRY_ATTEMPTS - 1:
                    wait = _RETRY_DELAY_SECONDS * (attempt + 1)
                    logger.warning(f"Gemini stream got 503, retrying in {wait:.0f}s (attempt {attempt+1}/{_RETRY_ATTEMPTS})")
                    await asyncio.sleep(wait)
                else:
                    raise

    async def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        if not self._client:
            # Deterministic mock embedding (dimension 768)
            import hashlib
            embeddings = []
            for t in texts:
                h = int(hashlib.md5(t.encode("utf-8")).hexdigest(), 16)
                emb = [((h >> (i % 64)) & 1) * 0.1 for i in range(768)]
                embeddings.append(emb)
            return embeddings

        results = []
        try:
            for text in texts:
                response = await self._client.aio.models.embed_content(
                    model=self._embedding_model,
                    contents=text,
                )
                results.append(response.embedding.values)
            return results
        except Exception as e:
            logger.warning(f"Gemini embedding API call failed ({e}). Falling back to local deterministic embeddings.")
            import hashlib
            embeddings = []
            for t in texts:
                h = int(hashlib.md5(t.encode("utf-8")).hexdigest(), 16)
                emb = [((h >> (i % 64)) & 1) * 0.1 for i in range(768)]
                embeddings.append(emb)
            return embeddings


    def _mock_generate(self, prompt: str, schema: Optional[Type[BaseModel]]) -> str:
        if schema and "ExecutiveBriefing" in schema.__name__:
            return json.dumps({
                "bubble_id": "demo",
                "bubble_title": "Executive Decision",
                "generated_at": "2026-10-18T16:00:00Z",
                "executive_summary": "Team converged on onboarding overhaul before pricing adjustments.",
                "decisions": ["Prioritize onboarding flow overhaul"],
                "consensus_points": ["Retention drop is hurting growth"],
                "disagreements": [{
                    "topic": "Pricing vs Onboarding",
                    "perspective_a": "Onboarding is too complex",
                    "perspective_b": "Pricing is 40% too high",
                    "unresolved_questions": ["Will price drop actually increase retention?"]
                }],
                "blockers": ["Lack of recent churn survey data"],
                "action_items": [{
                    "task": "Export churn analysis",
                    "owner": "Priya",
                    "priority": "high",
                    "deadline_hint": "Friday"
                }],
                "markdown_content": "# Executive Briefing\n\n- Onboarding overhaul agreed."
            })
        elif schema and "Insight" in schema.__name__:
            return json.dumps({
                "insights": [
                    {
                        "insight_id": "ins-1",
                        "type": "consensus",
                        "text": "Team agrees retention drop is the primary issue to solve.",
                        "confidence": 0.95,
                        "supporting_contribution_ids": ["c1", "c3"]
                    }
                ]
            })
        return "Analysis completed successfully."
