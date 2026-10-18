try:
    import firebase_admin
    from firebase_admin import credentials, firestore as admin_firestore, storage as admin_storage
    from google.cloud import firestore as gcloud_firestore
    from google.cloud import storage as gcloud_storage
    HAS_FIREBASE = True
except ImportError:
    firebase_admin = None
    gcloud_firestore = None
    gcloud_storage = None
    HAS_FIREBASE = False

from app.core.config import settings
from app.core.logging import logger
from app.core.firestore_compat import firestore

_firebase_app = None
_async_firestore_client = None
_storage_client = None


def init_firebase():
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    # If Firestore or Auth emulators are configured, set environment variables
    if settings.FIRESTORE_EMULATOR_HOST:
        os.environ["FIRESTORE_EMULATOR_HOST"] = settings.FIRESTORE_EMULATOR_HOST
    if settings.FIREBASE_AUTH_EMULATOR_HOST:
        os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = settings.FIREBASE_AUTH_EMULATOR_HOST
    if settings.FIREBASE_STORAGE_EMULATOR_HOST:
        os.environ["FIREBASE_STORAGE_EMULATOR_HOST"] = settings.FIREBASE_STORAGE_EMULATOR_HOST

    try:
        if not firebase_admin._apps:
            # When running on Cloud Run or with ADC:
            _firebase_app = firebase_admin.initialize_app(
                options={"projectId": settings.GOOGLE_CLOUD_PROJECT}
            )
        else:
            _firebase_app = firebase_admin.get_app()
        logger.info(f"Firebase Admin initialized for project {settings.GOOGLE_CLOUD_PROJECT}")
    except Exception as e:
        logger.warning(f"Firebase Admin initialization warning: {e}. Continuing with emulated clients.")
    return _firebase_app


def get_async_firestore_client():
    global _async_firestore_client
    if _async_firestore_client is None:
        init_firebase()
        if gcloud_firestore is not None:
            _async_firestore_client = gcloud_firestore.AsyncClient(
                project=settings.GOOGLE_CLOUD_PROJECT,
                database=settings.FIRESTORE_DATABASE
            )
        else:
            _async_firestore_client = firestore.AsyncClient()
    return _async_firestore_client


def get_storage_client():
    global _storage_client
    if _storage_client is None:
        init_firebase()
        if gcloud_storage is not None:
            _storage_client = gcloud_storage.Client(project=settings.GOOGLE_CLOUD_PROJECT)
        else:
            class _MockStorageBucket:
                def blob(self, name):
                    class _MockBlob:
                        def generate_signed_url(self, **kwargs):
                            return f"http://localhost:8000/mock-signed-url/{name}"
                        def download_as_bytes(self):
                            return b""
                        def delete(self):
                            pass
                    return _MockBlob()
                def list_blobs(self, prefix=None):
                    return []
            class _MockStorageClient:
                def bucket(self, name):
                    return _MockStorageBucket()
            _storage_client = _MockStorageClient()
    return _storage_client
