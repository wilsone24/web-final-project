# CardIAc

Aplicación web para el screening de enfermedad cardiovascular (ECV) sobre un modelo
XGBoost servido en **Databricks Model Serving**. Combina un frontend React (TypeScript +
Vite) con un proxy ligero en Node (Express + TypeScript) que oculta los tokens de
Databricks/OpenAI y resuelve CORS.

El sitio tiene cuatro vistas: una **landing** que explica el pipeline de datos, una
página de **predicción** (individual con análisis IA + lote por CSV), un **dashboard
analítico** sobre el modelo estrella `gold.fct_cardio_outcomes`, y una vista de
**pipeline** que dibuja el DAG de Databricks.

```
.
├─ backend/      Express + TS — proxy a Databricks (Model Serving + SQL + MLflow) y OpenAI
├─ frontend/     React + Vite + TS — landing, predicción, dashboard y pipeline
└─ compose.yml   Orquestación Docker de ambos servicios
```

## Arquitectura

```
 navegador ──/api/*──▶ proxy Node (8000) ──▶ Databricks Model Serving   (/predict)
                                          ├─▶ Databricks SQL Warehouse   (/dashboard)
                                          ├─▶ Databricks MLflow Registry (/model-info)
                                          └─▶ OpenAI Chat Completions     (/analyze)
```

Vite hace proxy de `/api/*` → `http://localhost:8000/*` en desarrollo, por lo que el
frontend nunca ve los tokens ni sufre CORS. Todos los secretos viven en `backend/.env`.

## Requisitos

- Node.js 18+
- Un workspace de Databricks con: un endpoint de Model Serving del clasificador, un SQL
  Warehouse con el catálogo gold, y el modelo registrado en Unity Catalog.
- (Opcional) Una API key de OpenAI para el análisis narrativo en la predicción individual.

## Variables de entorno

Copia `backend/.env.example` a `backend/.env` y complétalo:

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABRICKS_TOKEN` | sí | Token para Model Serving y MLflow Registry. |
| `DATABRICKS_ENDPOINT_URL` | sí | URL de invocación del endpoint de Model Serving. |
| `DATABRICKS_SQL_HOST` | sí (dashboard) | Host del SQL Warehouse (sin `https://`). |
| `DATABRICKS_SQL_PATH` | sí (dashboard) | Path del warehouse (`/sql/1.0/warehouses/…`). |
| `DATABRICKS_SQL_TOKEN` | sí (dashboard) | Token del SQL Warehouse. |
| `DATABRICKS_CATALOG` | no | Catálogo UC. Default `databricks_service_pf`. |
| `DATABRICKS_SCHEMA` | no | Schema. Default `gold`. |
| `DATABRICKS_WORKSPACE_HOST` | no | Host para MLflow. Si falta, se deriva de `DATABRICKS_ENDPOINT_URL`. |
| `DATABRICKS_MODEL_NAME` | no | Modelo UC. Default `databricks_service_pf.gold.cardio_classifier`. |
| `OPENAI_API_KEY` | no | Habilita `/analyze`. Si falta, el análisis IA se oculta solo. |
| `OPENAI_MODEL` | no | Modelo de OpenAI. Default `gpt-4o`. |
| `PORT` | no | Puerto del backend. Default `8000`. |

El frontend solo usa `VITE_BACKEND_URL` (default `http://localhost:8000`), relevante únicamente
si el backend no corre en ese host.

## Desarrollo local

```bash
# Terminal 1 — backend
cd backend
npm install
npm run dev        # http://localhost:8000 (tsx watch, auto-reload)

# Terminal 2 — frontend
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Abre `http://localhost:5173`.

## Docker Compose

```bash
# Exporta las variables (o usa un .env junto a compose.yml) y levanta ambos servicios
docker compose up --build
```

El backend expone un healthcheck en `/health`; el frontend arranca cuando el backend
está sano.

## Endpoints del backend

| Método | Ruta | Descripción |
|---|---|---|
| `GET`  | `/health` | Chequeo de vida. |
| `POST` | `/predict` | Reenvía `{ dataframe_records }` al endpoint de Model Serving. Reintenta cold starts con backoff. |
| `GET`  | `/dashboard` | Agregados (KPIs, demografía, hábitos, factores de riesgo) sobre `gold.fct_cardio_outcomes` vía SQL. |
| `GET`  | `/model-info` | Metadata del modelo `@champion` (versión, algoritmo, umbral, métricas de test, feature importance, threshold sweep) vía MLflow REST + UC. |
| `POST` | `/analyze` | Genera un análisis narrativo del resultado con OpenAI. Devuelve `503` si no hay `OPENAI_API_KEY`. |

`/dashboard` y `/model-info` cachean su resultado **en memoria por la vida del proceso**
(los datos gold y la metadata del modelo cambian poco). El usuario fuerza un refetch con el
botón de refrescar del dashboard, que añade `?refresh=1` para invalidar la caché del backend.

## Estructura del frontend

```
src/
├─ pages/        Landing, Predict, Dashboard, Pipeline (rutas de react-router)
├─ components/   PredictForm, ResultPanel, BatchPredict, BatchResults, Nav, Footer, BgCanvas
│  └─ dashboard/ KpiCard, ChartCard, GlassTooltip, charts y los charts del modelo
├─ lib/          csv (parser RFC 4180), batchMap (mapeo de columnas), factors (derivación de factores)
├─ hooks/        useReveal (animación on-scroll vía IntersectionObserver)
├─ api.ts        Cliente del proxy (fetchJson + cachés)
├─ theme.ts      Paleta pastel compartida con styles.css
└─ types.ts      Tipos compartidos
```

Scripts (backend y frontend comparten convención):

- `npm run dev`        — desarrollo con auto-reload
- `npm run typecheck`  — verifica tipos sin emitir
- `npm run build`      — compila a `dist/`
- `npm run preview` (frontend) / `npm run start:prod` (backend) — sirve el build

## Notas

- **Cold starts**: el SQL Warehouse y el endpoint de Model Serving pueden tardar 30s+ en
  arrancar si estaban detenidos. El proxy reintenta `/predict` con backoff y el frontend
  muestra spinners mientras tanto.
- **Degradación elegante**: si MLflow no responde, la sección del modelo muestra un aviso
  pequeño sin tumbar el resto del dashboard. Si falta `OPENAI_API_KEY`, el análisis IA se
  oculta solo.
- **Seguridad**: ningún token llega al navegador. El frontend siempre habla con el proxy.
