# CardIAc

Sitio React (TypeScript) + proxy Node (TypeScript) que consume el endpoint de Databricks Model Serving del clasificador cardiovascular, más un dashboard analítico contra el modelo estrella `gold.factcardio` vía Databricks SQL.

```
.
├─ backend/       Express + TS — proxy /predict y /dashboard
└─ frontend/      React + Vite + TS — landing, predict y dashboard
```

## 1. Levantar el backend

```bash
cd backend
npm install
npm run dev   # arranca en http://localhost:8000 con tsx watch
```

Requiere Node 18+ (fetch nativo). Tokens y conexión leen desde `backend/.env` (ya creado, **no lo subas a git**).

Endpoints:
- `POST /predict`   — proxy al endpoint de Model Serving
- `GET  /dashboard` — agregados sobre `gold.factcardio` (cache 5 min, `?refresh=1` para invalidar)
- `GET  /health`    — chequeo

Scripts:
- `npm run dev`        — desarrollo con auto-reload (tsx watch)
- `npm run typecheck`  — verifica tipos sin emitir
- `npm run build`      — compila a `dist/`
- `npm run start:prod` — corre el JS compilado

## 2. Levantar el frontend

```bash
cd frontend
npm install
npm run dev   # arranca en http://localhost:5173
```

Vite hace proxy de `/api/*` → `http://localhost:8000/*`. El frontend llama a `/api/predict` y `/api/dashboard` sin preocuparse por CORS ni por los tokens.

Scripts:
- `npm run dev`       — desarrollo
- `npm run typecheck` — verifica tipos
- `npm run build`     — type-check + build de producción a `dist/`
- `npm run preview`   — sirve el build

## 3. Notas

- **Tokens nunca en frontend**: viven en `backend/.env` (gitignored).
- El SQL warehouse de Databricks puede tardar 30s+ en arrancar si está detenido (cold start).
- Si rotaste algún token, actualízalo en `backend/.env`.
