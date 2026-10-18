import pytest
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

os.environ["ENVIRONMENT"] = "test"
os.environ["LLM_PROVIDER"] = "gemini"
os.environ["GEMINI_API_KEY"] = "AIzaSyFakeKeyForTest"

from app.llm.gemini import GeminiAdapter
from app.llm.base import LLMAdapter
from app.models.insight import Insight


class MockFirestoreClient:
    """In-memory mock supporting transactions, batches, and subcollections for unit testing."""
    def __init__(self):
        self.store = {}

    def collection(self, name: str):
        return MockCollectionRef(self.store, [name])

    def batch(self):
        return MockBatch(self)

    def transaction(self):
        return MockTransaction(self)


class MockDocRef:
    def __init__(self, store: dict, path: list):
        self.store = store
        self.path = path
        self.id = path[-1]

    @property
    def reference(self):
        return self

    def collection(self, name: str):
        return MockCollectionRef(self.store, self.path + [name])

    async def get(self, transaction=None):
        data = self._get_data()
        return MockSnapshot(self.id, data, exists=(data is not None))

    async def set(self, data: dict, merge: bool = False):
        cur = self._get_data() or {}
        if merge:
            cur.update(data)
            self._set_data(cur)
        else:
            self._set_data(data)

    async def update(self, data: dict):
        cur = self._get_data() or {}
        cur.update(data)
        self._set_data(cur)

    async def delete(self):
        key = "/".join(self.path)
        self.store.pop(key, None)

    def _get_data(self):
        return self.store.get("/".join(self.path))

    def _set_data(self, data: dict):
        self.store["/".join(self.path)] = data.copy()


class MockCollectionRef:
    def __init__(self, store: dict, path: list):
        self.store = store
        self.path = path

    def document(self, doc_id: str = None):
        import uuid
        did = doc_id or f"doc_{uuid.uuid4().hex[:8]}"
        return MockDocRef(self.store, self.path + [did])

    def order_by(self, field: str, direction=None):
        return self

    def limit(self, count: int):
        return self

    def where(self, field: str, op: str, value):
        return self

    async def get(self, transaction=None):
        prefix = "/".join(self.path) + "/"
        matched = []
        for k, v in list(self.store.items()):
            if k.startswith(prefix):
                suffix = k[len(prefix):]
                if "/" not in suffix:
                    ref = MockDocRef(self.store, self.path + [suffix])
                    matched.append(MockSnapshot(suffix, v, exists=True, reference=ref))
        return matched


class MockSnapshot:
    def __init__(self, doc_id: str, data: dict, exists: bool = True, reference=None):
        self.id = doc_id
        self._data = data
        self.exists = exists
        self.reference = reference

    def to_dict(self):
        return self._data or {}


class MockBatch:
    def __init__(self, client):
        self.client = client
        self.ops = []

    def set(self, doc_ref, data):
        self.ops.append(("set", doc_ref, data))

    def update(self, doc_ref, data):
        self.ops.append(("update", doc_ref, data))

    def delete(self, doc_ref):
        self.ops.append(("delete", doc_ref, None))

    async def commit(self):
        for op, ref, data in self.ops:
            if op == "set":
                await ref.set(data)
            elif op == "update":
                await ref.update(data)
            elif op == "delete":
                await ref.delete()
        self.ops.clear()


class MockTransaction:
    def __init__(self, client):
        self.client = client

    def set(self, ref, data, merge: bool = False):
        key = "/".join(ref.path)
        cur = self.client.store.get(key, {})
        if merge:
            cur.update(data)
            self.client.store[key] = cur
        else:
            self.client.store[key] = data.copy()

    def update(self, ref, data):
        key = "/".join(ref.path)
        cur = self.client.store.get(key, {})
        cur.update(data)
        self.client.store[key] = cur

    def delete(self, ref):
        key = "/".join(ref.path)
        self.client.store.pop(key, None)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def mock_db():
    return MockFirestoreClient()


@pytest.fixture
def mock_llm():
    return GeminiAdapter()
