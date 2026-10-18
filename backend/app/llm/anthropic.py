import json
from typing import AsyncIterator, List, Optional, Type, TypeVar
from pydantic import BaseModel
try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    anthropic = None
    HAS_ANTHROPIC = False

from app.core.config import settings
from app.core.logging import logger
from app.llm.base import LLMAdapter, LLMResponse

T = TypeVar("T", bound=BaseModel)


class AnthropicAdapter(LLMAdapter):
    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
    ):
        self._api_key = api_key or settings.ANTHROPIC_API_KEY
        self._model_name = model_name or settings.ANTHROPIC_MODEL

        if HAS_ANTHROPIC and self._api_key and not self._api_key.startswith("sk-ant-fake"):
            self._client = anthropic.AsyncAnthropic(api_key=self._api_key)
        else:
            self._client = None
            logger.info("AnthropicAdapter initialized in mock/fallback mode")

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
            # Fallback for testing without active Claude key
            content = "{}" if response_schema else "Claude generated analysis."
            parsed = None
            return LLMResponse(
                content=content,
                parsed=parsed,
                prompt_tokens=len(prompt) // 4,
                completion_tokens=len(content) // 4,
                total_tokens=(len(prompt) + len(content)) // 4,
                model=self._model_name,
            )

        system_instruction = system_prompt or ""
        effective_prompt = prompt
        if response_schema:
            schema_json = json.dumps(response_schema.model_json_schema(), indent=2)
            system_instruction += (
                f"\n\nYou MUST respond ONLY with valid JSON conforming to this schema:\n{schema_json}\n"
                "Do not include markdown codeblocks (```json) or conversational preamble."
            )

        response = await self._client.messages.create(
            model=self._model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_instruction,
            messages=[{"role": "user", "content": effective_prompt}],
        )

        content = response.content[0].text if response.content else ""
        parsed = None
        if response_schema:
            try:
                # Strip potential markdown code fences
                clean_json = content.strip()
                if clean_json.startswith("```json"):
                    clean_json = clean_json[7:]
                if clean_json.endswith("```"):
                    clean_json = clean_json[:-3]
                parsed = response_schema.model_validate_json(clean_json.strip())
            except Exception as e:
                logger.error(f"Failed to parse structured JSON from Claude: {e}")

        prompt_tokens = response.usage.input_tokens
        completion_tokens = response.usage.output_tokens

        return LLMResponse(
            content=content,
            parsed=parsed,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
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
            tokens = ["Hello ", "from ", "Claude ", "AI! ", "Synthesizing ", "bubble ", "context."]
            for t in tokens:
                yield t
            return

        async with self._client.messages.stream(
            model=self._model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt or "",
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def embed(self, texts: List[str]) -> List[List[float]]:
        # Anthropic does not have a native public embeddings API; delegate to Gemini or mock
        import hashlib
        embeddings = []
        for t in texts:
            h = int(hashlib.md5(t.encode("utf-8")).hexdigest(), 16)
            emb = [((h >> (i % 64)) & 1) * 0.1 for i in range(768)]
            embeddings.append(emb)
        return embeddings
