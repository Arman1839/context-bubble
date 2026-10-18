import pytest
from typing import AsyncIterator, List, Optional, Type
from pydantic import BaseModel
from app.llm.base import LLMAdapter, LLMResponse
from app.llm.resilient import ResilientLLMAdapter


class FailingAdapter(LLMAdapter):
    def __init__(self, fail_count: int = 10, error_msg: str = "429 ResourceExhausted"):
        self._fails_left = fail_count
        self._error_msg = error_msg
        self.call_count = 0

    @property
    def model_name(self) -> str:
        return "failing-model"

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        response_schema: Optional[Type[BaseModel]] = None,
    ) -> LLMResponse:
        self.call_count += 1
        if self._fails_left > 0:
            self._fails_left -= 1
            raise RuntimeError(self._error_msg)
        return LLMResponse(content="Recovered after retries", model=self.model_name)

    async def stream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        raise RuntimeError(self._error_msg)
        yield "never"

    async def embed(self, texts: List[str]) -> List[List[float]]:
        raise RuntimeError(self._error_msg)


class WorkingAdapter(LLMAdapter):
    @property
    def model_name(self) -> str:
        return "backup-claude"

    async def generate(self, prompt: str, **kwargs) -> LLMResponse:
        return LLMResponse(content="Hello from backup adapter", model=self.model_name)

    async def stream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        yield "token1"
        yield "token2"

    async def embed(self, texts: List[str]) -> List[List[float]]:
        return [[0.1] * 768 for _ in texts]


@pytest.mark.anyio
async def test_resilient_retry_success():
    # Fails 2 times then recovers on 3rd attempt
    primary = FailingAdapter(fail_count=2)
    resilient = ResilientLLMAdapter(primary=primary, fallback=None, max_retries=3, initial_backoff=0.01)
    res = await resilient.generate("test prompt")
    assert res.content == "Recovered after retries"
    assert primary.call_count == 3


@pytest.mark.anyio
async def test_circuit_breaker_failover_to_backup():
    # Primary always fails with 429
    primary = FailingAdapter(fail_count=10)
    backup = WorkingAdapter()
    resilient = ResilientLLMAdapter(primary=primary, fallback=backup, max_retries=2, initial_backoff=0.01)

    res = await resilient.generate("test prompt")
    assert res.content == "Hello from backup adapter"
    assert "failover" in resilient.model_name
