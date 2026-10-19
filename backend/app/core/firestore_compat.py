import uuid
from typing import Dict, Any, List, Optional

try:
    from google.cloud import firestore
except ImportError:
    class _MockQuery:
        ASCENDING = "ASCENDING"
        DESCENDING = "DESCENDING"

    class _MockFirestoreModule:
        SERVER_TIMESTAMP = "SERVER_TIMESTAMP"
        AsyncClient = object
        AsyncTransaction = object
        Query = _MockQuery

        @staticmethod
        def async_transactional(func):
            return func

    firestore = _MockFirestoreModule()


class MockSnapshot:
    def __init__(self, doc_id: str, data: Optional[Dict[str, Any]], exists: bool = True, reference=None):
        self.id = doc_id
        self._data = data
        self.exists = exists
        self.reference = reference

    def to_dict(self):
        return self._data or {}


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
        return MockSnapshot(self.id, data, exists=(data is not None), reference=self)

    def _sanitize_data(self, data: dict) -> dict:
        from datetime import datetime, timezone
        sanitized = {}
        for k, v in data.items():
            if (
                v == "SERVER_TIMESTAMP"
                or v == getattr(firestore, "SERVER_TIMESTAMP", "SERVER_TIMESTAMP")
                or "Sentinel" in type(v).__name__
                or "SERVER_TIMESTAMP" in str(v)
            ):
                sanitized[k] = datetime.now(timezone.utc)
            elif isinstance(v, dict):
                sanitized[k] = self._sanitize_data(v)
            else:
                sanitized[k] = v
        return sanitized

    async def set(self, data: dict, merge: bool = False):
        clean_data = self._sanitize_data(data)
        cur = self._get_data() or {}
        if merge:
            cur.update(clean_data)
            self._set_data(cur)
        else:
            self._set_data(clean_data)

    async def update(self, data: dict):
        clean_data = self._sanitize_data(data)
        cur = self._get_data() or {}
        cur.update(clean_data)
        self._set_data(cur)

    async def delete(self):
        key = "/".join(self.path)
        self.store.pop(key, None)

    def _get_data(self):
        return self.store.get("/".join(self.path))

    def _set_data(self, data: dict):
        self.store["/".join(self.path)] = data.copy()


class MockCollectionRef:
    def __init__(self, store: dict, path: list, filters=None, order_by_fields=None, limit_val=None):
        self.store = store
        self.path = path
        self._filters = list(filters or [])
        self._order_by = list(order_by_fields or [])
        self._limit = limit_val

    def document(self, doc_id: Optional[str] = None):
        did = doc_id or f"doc_{uuid.uuid4().hex[:8]}"
        return MockDocRef(self.store, self.path + [did])

    def order_by(self, field: str, direction=None):
        return MockCollectionRef(
            self.store, self.path, self._filters, self._order_by + [(field, direction)], self._limit
        )

    def limit(self, count: int):
        return MockCollectionRef(
            self.store, self.path, self._filters, self._order_by, count
        )

    def where(self, field: str, op: str, value: Any):
        return MockCollectionRef(
            self.store, self.path, self._filters + [(field, op, value)], self._order_by, self._limit
        )

    async def get(self, transaction=None):
        prefix = "/".join(self.path) + "/"
        matched = []
        for k, v in list(self.store.items()):
            if k.startswith(prefix):
                suffix = k[len(prefix):]
                if "/" not in suffix:
                    passes = True
                    for field, op, target in self._filters:
                        doc_val = v.get(field) if isinstance(v, dict) else None
                        if not self._check_filter(doc_val, op, target):
                            passes = False
                            break
                    if passes:
                        ref = MockDocRef(self.store, self.path + [suffix])
                        matched.append(MockSnapshot(suffix, v, exists=True, reference=ref))

        # Order by
        for field, direction in reversed(self._order_by):
            reverse = (direction == "DESCENDING" or getattr(direction, "value", None) == "DESCENDING")
            matched.sort(
                key=lambda m: (
                    (m._data or {}).get(field) is None,
                    (m._data or {}).get(field)
                ),
                reverse=reverse
            )

        if self._limit is not None and self._limit >= 0:
            matched = matched[:self._limit]

        return matched

    @staticmethod
    def _check_filter(doc_val: Any, op: str, target: Any) -> bool:
        if op == "==":
            return doc_val == target
        if op == "!=":
            return doc_val != target

        # Handle datetime comparisons where one might be str and other datetime
        if isinstance(doc_val, str) and hasattr(target, "isoformat"):
            try:
                from datetime import datetime
                doc_val = datetime.fromisoformat(doc_val)
            except Exception:
                pass
        elif isinstance(target, str) and hasattr(doc_val, "isoformat"):
            try:
                from datetime import datetime
                target = datetime.fromisoformat(target)
            except Exception:
                pass

        try:
            if op == "<=":
                return doc_val <= target
            if op == "<":
                return doc_val < target
            if op == ">=":
                return doc_val >= target
            if op == ">":
                return doc_val > target
            if op == "in":
                return doc_val in target
            if op == "array_contains":
                return isinstance(doc_val, (list, tuple, set)) and target in doc_val
        except TypeError:
            return False

        return False


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
    """Mock async transaction compatible with google-cloud-firestore async_transactional."""
    def __init__(self, client):
        self.client = client
        self._read_only = False
        self._id = None
        self._max_attempts = 5

    async def get(self, ref):
        return await ref.get(transaction=self)

    def set(self, ref, data, merge: bool = False):
        clean_data = ref._sanitize_data(data)
        key = "/".join(ref.path)
        cur = self.client.store.get(key, {})
        if merge:
            cur.update(clean_data)
            self.client.store[key] = cur
        else:
            self.client.store[key] = clean_data

    def update(self, ref, data):
        clean_data = ref._sanitize_data(data)
        key = "/".join(ref.path)
        cur = self.client.store.get(key, {})
        cur.update(clean_data)
        self.client.store[key] = cur

    def delete(self, ref):
        key = "/".join(ref.path)
        self.client.store.pop(key, None)


def safe_async_transactional(func):
    """
    Decorator for firestore async transactions that executes cleanly
    whether using MockTransaction in memory or real GCP Firestore.
    """
    async def _tx_wrapper(transaction, *args, **kwargs):
        if isinstance(transaction, MockTransaction) or not hasattr(transaction, "_read_only"):
            return await func(transaction, *args, **kwargs)
        try:
            from google.cloud.firestore_v1.async_transaction import async_transactional as gcloud_tx
            return await gcloud_tx(func)(transaction, *args, **kwargs)
        except Exception:
            return await func(transaction, *args, **kwargs)
    return _tx_wrapper

# Patch firestore module so all @firestore.async_transactional call safe wrapper
firestore.async_transactional = safe_async_transactional


class InMemoryFirestoreClient:
    """In-memory mock supporting transactions, batches, and subcollections."""
    def __init__(self):
        self.store = {}

    def collection(self, name: str):
        return MockCollectionRef(self.store, [name])

    def batch(self):
        return MockBatch(self)

    def transaction(self):
        return MockTransaction(self)
