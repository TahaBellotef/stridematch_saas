# SMLab Frontend

Next.js UI that consumes the FastAPI backend. It replaces the Streamlit rendering layer with a
modern React experience while keeping all biomechanics computations in Python.

## Prerequisites

- Node.js 18+
- The backend running locally (`uvicorn backend.app.main:app --reload`)

## Getting started

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

The UI is available at http://localhost:3000 and expects the API at `NEXT_PUBLIC_API_URL`.

## Project structure

- `app/layout.tsx` wraps every route with the brand navigation + theme provider.
- `app/(marketing)/*` contains public marketing pages.
- `app/(auth)/login` contains the admin authentication flow.
- `app/(dashboard)/admin` serves the protected admin console (requires JWT).
- `app/user/results` exposes authenticated history for runners.
- `src/components` hosts reusable UI, navigation, and theme primitives.
- `src/lib` gathers client helpers (API endpoints, etc.).

## Available pages

- Runner profile form → POST `/api/catalog/recommendations`
- Video upload form → POST `/api/analysis/run`
- Download link for annotated MP4 → GET `/api/analysis/{jobId}/video`
- Admin panel (visit `/admin`) → lists users (`GET /api/admin/users`) and the shoe inventory
  (`GET /api/v1/admin/catalog`).
- User panel (visit `/user/results`) → view stored analyses for a specific identifier via
  `GET /api/analysis/user/{userId}` with direct download links for annotated clips.
- Admin login (visit `/login`) → authenticates against `POST /api/auth/login` and stores the bearer
  token client-side to secure `/admin` access.

Place the official logo asset at `public/STRIDEMATCH_ICON_BLUE.png` to replace the fallback mark used in the navigation bar.
