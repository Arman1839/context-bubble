import asyncio
import random
import time
from typing import AsyncIterator, List, Optional, Type, TypeVar
from pydantic import BaseModel
from app.core.logging import logger
from app.llm.base import LLMAdapter, LLMResponse

T = TypeVar("T", bound=BaseModel)

RATE_LIMIT_KEYWORDS = ("429", "resource_exhausted", "quota", "rate limit", "overloaded", "503", "unavailable")


def _is_transient_error(e: Exception) -> bool:
    msg = str(e).lower()
    # Quota/resource-exhausted responses are project-level limits; retries against
    # the same provider burn time without restoring quota. Fail over immediately.
    if any(term in msg for term in ("quota", "resource_exhausted", "429", "daily limit")):
        return False
    return any(k in msg for k in RATE_LIMIT_KEYWORDS)


class ResilientLLMAdapter(LLMAdapter):
    """
    Production-grade resilient LLM adapter with:
    - Exponential backoff with random jitter for transient errors (429/503)
    - Automatic circuit-breaker failover to secondary provider (e.g. Gemini -> Claude or vice-versa)
    - Zero-downtime health tracking
    """

    def __init__(
        self,
        primary: LLMAdapter,
        fallback: Optional[LLMAdapter] = None,
        max_retries: int = 3,
        initial_backoff: float = 1.0,
        max_backoff: float = 8.0,
    ):
        self.primary = primary
        self.fallback = fallback
        self.max_retries = max_retries
        self.initial_backoff = initial_backoff
        self.max_backoff = max_backoff
        self._circuit_open = False
        self._circuit_opened_at: float = 0.0
        self._circuit_cooldown_seconds: float = 60.0

    @property
    def model_name(self) -> str:
        if self._is_circuit_active() and self.fallback:
            return f"{self.fallback.model_name} (failover)"
        return self.primary.model_name

    def _is_circuit_active(self) -> bool:
        if not self._circuit_open:
            return False
        if time.time() - self._circuit_opened_at > self._circuit_cooldown_seconds:
            logger.info("Circuit breaker cooldown expired; resetting to primary LLM adapter.")
            self._circuit_open = False
            return False
        return True

    def _trip_circuit(self, reason: str):
        if self.fallback:
            logger.warning(
                f"Tripping LLM circuit breaker from {self.primary.model_name} to {self.fallback.model_name}. Reason: {reason}"
            )
            self._circuit_open = True
            self._circuit_opened_at = time.time()

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        response_schema: Optional[Type[T]] = None,
    ) -> LLMResponse:
        active_adapter = self.fallback if (self._is_circuit_active() and self.fallback) else self.primary

        backoff = self.initial_backoff
        for attempt in range(self.max_retries):
            try:
                return await active_adapter.generate(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_schema=response_schema,
                )
            except Exception as e:
                is_transient = _is_transient_error(e)
                logger.warning(
                    f"LLM generate attempt {attempt + 1}/{self.max_retries} failed on {active_adapter.model_name}: {e}"
                )

                if attempt == self.max_retries - 1:
                    # Final attempt on active adapter failed
                    if active_adapter == self.primary and self.fallback:
                        self._trip_circuit(f"Primary adapter failed after {self.max_retries} attempts: {e}")
                        try:
                            return await self.fallback.generate(
                                prompt=prompt,
                                system_prompt=system_prompt,
                                temperature=temperature,
                                max_tokens=max_tokens,
                                response_schema=response_schema,
                            )
                        except Exception as fallback_err:
                            logger.error(f"Fallback adapter {self.fallback.model_name} also failed: {fallback_err}")
                            raise fallback_err
                    raise e

                if is_transient:
                    jitter = random.uniform(0.1, 0.5)
                    sleep_time = min(backoff + jitter, self.max_backoff)
                    logger.info(f"Retrying LLM call in {sleep_time:.2f}s due to transient error...")
                    await asyncio.sleep(sleep_time)
                    backoff *= 2.0
                else:
                    # Non-transient error; trip immediately if fallback available
                    if active_adapter == self.primary and self.fallback:
                        self._trip_circuit(f"Non-transient error: {e}")
                        return await self.fallback.generate(
                            prompt=prompt,
                            system_prompt=system_prompt,
                            temperature=temperature,
                            max_tokens=max_tokens,
                            response_schema=response_schema,
                        )
                    raise e

        raise RuntimeError("Unreachable: LLM generate retries exhausted without returning.")

    async def stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> AsyncIterator[str]:
        active_adapter = self.fallback if (self._is_circuit_active() and self.fallback) else self.primary

        try:
            async for token in active_adapter.stream(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            ):
                yield token
        except Exception as e:
            logger.warning(f"Error during stream on {active_adapter.model_name}: {e}")
            if active_adapter == self.primary and self.fallback:
                self._trip_circuit(f"Stream error: {e}")
                async for token in self.fallback.stream(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                ):
                    yield token
            else:
                raise e

    async def embed(self, texts: List[str]) -> List[List[float]]:
        active_adapter = self.fallback if (self._is_circuit_active() and self.fallback) else self.primary
        try:
            return await active_adapter.embed(texts)
        except Exception as e:
            logger.warning(f"Error during embedding on {active_adapter.model_name}: {e}")
            if active_adapter == self.primary and self.fallback:
                self._trip_circuit(f"Embedding error: {e}")
                return await self.fallback.embed(texts)
            raise e
