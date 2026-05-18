# CardioPredict

Sitio React + proxy Node que consume el endpoint de Databricks Model Serving del clasificador cardiovascular.

```
.
├─ backend/       Proxy Express que reenvía a Databricks (oculta el token, resuelve CORS)
└─ frontend/      App React + Vite (landing + página de predicción)
```

## 1. Levantar el backend

```bash
cd backend
npm install
npm run dev   # arranca en http://localhost:8000
```

Requiere Node 18+ (usa `fetch` nativo). El token se lee desde `backend/.env` (ya creado, **no lo subas a git**).

Endpoints:
- `POST /predict` — recibe `{ dataframe_records: [...] }` y reenvía a Databricks
- `GET  /health`  — chequeo

## 2. Levantar el frontend

```bash
cd frontend
npm install
npm run dev   # arranca en http://localhost:5173
```

Vite hace proxy de `/api/*` → `http://localhost:8000/*`, por lo que el frontend llama a `/api/predict` sin preocuparse por CORS ni por el token.

## 3. Producción

Build estático del frontend:
```bash
cd frontend
npm run build   # genera frontend/dist/
```

Para producción real, lo más limpio es servir `dist/` desde el mismo backend Express (añade `app.use(express.static('../frontend/dist'))`) o detrás de un nginx que rute `/api` al backend y todo lo demás al estático.

## Notas

- El bearer token **nunca** debe vivir en el frontend. Por eso el proxy.
- `backend/.env` está en `.gitignore`. Si rotaste el token, actualízalo ahí.
- La URL del endpoint está hardcodeada en `backend/server.js` (`ENDPOINT_URL`).
