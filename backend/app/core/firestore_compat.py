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
