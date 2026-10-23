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

import os
from app.core.config import settings
from app.core.logging import logger
from app.core.firestore_compat import firestore, InMemoryFirestoreClient

_firebase_app = None
_async_firestore_client = None
_storage_client = None


def init_firebase():
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    # If Firestore or Auth emulators are configured and running, set environment variables
    if settings.FIRESTORE_EMULATOR_HOST:
        os.environ["FIRESTORE_EMULATOR_HOST"] = settings.FIRESTORE_EMULATOR_HOST
    if settings.FIREBASE_AUTH_EMULATOR_HOST:
        os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = settings.FIREBASE_AUTH_EMULATOR_HOST
    if settings.FIREBASE_STORAGE_EMULATOR_HOST:
        os.environ["FIREBASE_STORAGE_EMULATOR_HOST"] = settings.FIREBASE_STORAGE_EMULATOR_HOST

    try:
        if not firebase_admin or not firebase_admin._apps:
            # Use service account key if GOOGLE_APPLICATION_CREDENTIALS is set
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
            if cred_path and os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                _firebase_app = firebase_admin.initialize_app(
                    cred,
                    options={
                        "projectId": settings.GOOGLE_CLOUD_PROJECT,
                        "storageBucket": settings.GCS_BUCKET_NAME,
                    }
                )
                logger.info(f"Firebase Admin initialized with service account for project {settings.GOOGLE_CLOUD_PROJECT}")
            else:
                _firebase_app = firebase_admin.initialize_app(
                    options={"projectId": settings.GOOGLE_CLOUD_PROJECT}
                )
                logger.info(f"Firebase Admin initialized (default credentials) for project {settings.GOOGLE_CLOUD_PROJECT}")
        else:
            _firebase_app = firebase_admin.get_app()
    except Exception as e:
        logger.info(f"Firebase Admin running in dev mode: {e}")
    return _firebase_app


def get_async_firestore_client():
    global _async_firestore_client
    if _async_firestore_client is None:
        init_firebase()
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
        has_credentials = cred_path and os.path.exists(cred_path)

        if getattr(settings, "USE_IN_MEMORY_FIRESTORE", False):
            logger.info("Using InMemoryFirestoreClient as configured by USE_IN_MEMORY_FIRESTORE.")
            _async_firestore_client = InMemoryFirestoreClient()
        elif not has_credentials and settings.ENVIRONMENT in ("development", "test") and not settings.FIRESTORE_EMULATOR_HOST:
            logger.info("Using InMemoryFirestoreClient for local development (no service account).")
            _async_firestore_client = InMemoryFirestoreClient()
        elif gcloud_firestore is not None:
            try:
                _async_firestore_client = gcloud_firestore.AsyncClient(
                    project=settings.GOOGLE_CLOUD_PROJECT,
                    database=settings.FIRESTORE_DATABASE,
                )
                logger.info(f"Using real Cloud Firestore for project {settings.GOOGLE_CLOUD_PROJECT}")
            except Exception as e:
                logger.warning(f"gcloud_firestore connection error: {e}. Falling back to in-memory.")
                _async_firestore_client = InMemoryFirestoreClient()
        else:
            _async_firestore_client = InMemoryFirestoreClient()
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
