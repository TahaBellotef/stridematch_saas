# SMLab — Backend

FastAPI backend for SMLab — **AI-assisted gait analysis** and **personalized shoe recommendations**.
Uses **RTMPose** (ONNX) for pose estimation, with a video pipeline built on **PyAV** and **OpenCV-headless**.

---

## Getting Started

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # configure environment variables

uvicorn main:app --reload
```

Server: **http://127.0.0.1:8000**
Health check: `GET /healthz`
Swagger UI: **http://127.0.0.1:8000/docs**

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | FastAPI 0.128, Pydantic v2, Uvicorn |
| Pose Estimation | RTMPose via rtmlib + ONNX Runtime |
| Video | PyAV, OpenCV-headless, Pillow |
| Data | NumPy, Pandas, SciPy |
| Database | AWS Aurora RDS (PostgreSQL) via SQLAlchemy 2.0 + psycopg2 |
| Auth | AWS Cognito (JWKS), PyJWT, bcrypt |
| Storage | boto3 (S3), local `backend_storage/` fallback |
| Security | slowapi (rate limiting), security-header middleware |

---

## Project Structure

```
backend/
├── main.py                  # App factory & ASGI entry point
├── app/
│   ├── routers/             # API endpoints (FastAPI routers)
│   ├── services/            # Business logic
│   │   ├── analysis/        # Gait analysis pipeline
│   │   ├── foot_scan/       # Foot scan processing
│   │   ├── catalog.py       # Shoe catalog & recommendations
│   │   └── upload_storage.py
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response DTOs
│   ├── db/                  # Engine, sessions, multi-tenancy
│   ├── auth.py              # Cognito + JWT auth
│   └── config.py            # Env-based configuration
├── core/
│   ├── pose/                # RTMPose pipeline, metrics, annotation
│   ├── foot/                # Homography, image ops for foot scan
│   └── video.py             # Frame extraction utilities
├── data/
│   └── catalog.py           # DynamoDB catalog loader
├── tests/                   # pytest suite
├── scripts/                 # One-off maintenance scripts
└── fonts/                   # Bundled font for video annotation
```

---

## API Overview

All routes are mounted under `/api/v1`.

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Authenticate and receive JWT |
| GET | `/auth/me` | Current user info |
| GET | `/auth/tenant` | Tenant context |

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sessions` | Create analysis session |
| GET | `/sessions/{session_id}` | Retrieve session |

### Analysis
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/analysis/run` | Upload MP4, receive stride metrics + annotated video |
| GET | `/analysis/{job_id}` | Get analysis result |
| GET | `/analysis/{job_id}/video` | Stream annotated video |
| GET | `/analysis/user/{user_id}` | Historical analyses for user |

### Foot Scan
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/foot-scan/session` | Create foot scan session |
| GET | `/foot-scan/session/{id}` | Get scan session |
| POST | `/foot-scan/analyze` | Run foot scan analysis |
| GET | `/foot-scan/{job_id}` | Get scan result |
| GET | `/foot-scan/customer/{customer_id}` | Scans by customer |

### Catalog
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/catalog/recommendations` | Shoe recommendations based on gait + preferences |

### Uploads
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/uploads` | Upload file |
| PUT | `/uploads` | Update upload |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| Various | `/admin/*` | Customer, organization, store, and member management |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANALYSIS_RESULTS_DATABASE_URL` | Override for analysis results DB (default: local SQLite) |
| `STRIDEMATCH_MEDIA_DIR` | Annotated video storage (default: `backend_storage/`) |
| `STRIDEMATCH_CORS_ORIGINS` | Comma-separated allowed origins |
| `STRIDEMATCH_AUTH_SECRET` | JWT signing secret |
| `STRIDEMATCH_AUTH_EXPIRES_MINUTES` | Token TTL in minutes (default: 60) |
| `ADMIN_CREDENTIALS_JSON` | Admin credentials (JSON) |
| `CATALOG_SOURCE` | `auto`, `local`, `database`, or `gsheet` |
| `COGNITO_JWKS_PATH` / `COGNITO_JWKS_JSON` | Offline Cognito JWKS source |

---

## Database

The backend connects to **AWS Aurora RDS** (PostgreSQL-compatible). Tables are auto-created on startup via `Base.metadata.create_all()`.

```bash
export DATABASE_URL=postgresql+psycopg2://user:pass@<aurora-endpoint>:5432/stridematch
```

Multi-tenancy is supported via organizations, stores, and user memberships. A default organization and superadmin membership are bootstrapped on first run.

---

## Testing

```bash
pip install -r requirements-dev.txt
pytest
```

---

## Deployment

CI/CD is configured via GitHub Actions (`.github/workflows/deploy.yml`):
1. **Test** — runs pytest on push to `main` / `RTMPose`
2. **Build** — Docker image (GPU-enabled)
3. **Deploy** — EC2

```bash
# Local Docker build
docker build -f Dockerfile.gpu -t smlab-backend .
```

---

**SMLab 2025-2026 — All rights reserved.**
