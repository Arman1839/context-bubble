# Context Bubble – Backend

Real-time, ephemeral collaboration backend designed for small high-velocity teams (3–10 participants). The backend provides group chat with an ambient **Bubble AI** participant, a rolling RAG & semantic-diff intelligence pipeline, live WebSockets/SSE streaming, and an automated pop & crypto-shredding lifecycle.

---

## Tech Stack
- **Runtime:** Python 3.12 / 3.13, FastAPI (async), Pydantic v2, Uvicorn
- **Persistence & Cloud:** Google Cloud Firestore (Vector Search enabled), Cloud Storage, Cloud Tasks, Cloud Scheduler
- **Authentication & Security:** Firebase Auth, App Check, AES-256-GCM Envelope Encryption
- **AI/LLM:** Dual-provider adapter (Google Gemini 2.5 Flash & Anthropic Claude 3.5 Sonnet)
- **Document & PDF Engine:** ReportLab & Jinja2
- **Exporters:** Notion, Jira, Linear, Slack

---

## Local Development Setup

### 1. Prerequisites
- Python 3.12+
- Node.js & Firebase CLI (`npm install -g firebase-tools`)
- Docker & Docker Compose (optional for containerized emulators)

### 2. Environment Configuration
```bash
cd backend
cp .env.example .env
```

### 3. Install Dependencies
```bash
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### 4. Start Firebase Emulators
In a separate terminal:
```bash
firebase emulators:start
```
The Firebase Emulator Suite UI will be accessible at [http://localhost:4000](http://localhost:4000).

### 5. Run the Backend API Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation (Swagger UI): [http://localhost:8000/docs](http://localhost:8000/docs)

### 6. Seed Demo Data (Matching Frontend `lib/sample-data.ts`)
To populate Firestore with the sample bubble ("Pivot Decision – Oct 2026"):
```bash
python scripts/seed_demo.py
```

---

## Running the Automated Test Suite

Run unit, load, and crypto-shredding tests:
```bash
pytest -v tests/
```

### Test Coverage Highlights:
- `test_auth_and_join_cap.py`: Proves the **10-participant transactional hard limit** rejects the 11th user while gracefully allowing rejoins.
- `test_debounce_and_diff.py`: Tests trailing window debouncing and cosine semantic diffing.
- `test_pop_state_machine.py`: Tests `ACTIVE -> POPPING -> EXPORTING -> SHREDDING -> POPPED` state machine.
- `test_crypto_shredding.py`: Verifies that post-pop subcollections, GCS blobs, and encryption keys are **completely deleted and irrecoverable**, with a cryptographically signed HMAC receipt.
- `test_load_simulation.py`: Simulates 100 concurrent participants attempting to join and burst 100 messages with monotonic sequence ordering.

---

## Production Cloud Run Deployment

1. Build & Push Docker Container:
```bash
gcloud builds submit --tag gcr.io/[PROJECT_ID]/context-bubble-backend backend/
```
2. Deploy to Cloud Run:
```bash
gcloud run deploy context-bubble-backend \
  --image gcr.io/[PROJECT_ID]/context-bubble-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production,GOOGLE_CLOUD_PROJECT=[PROJECT_ID],LLM_PROVIDER=gemini
```
