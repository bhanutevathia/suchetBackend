import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { loadAllData, getDatasetsSummary } from './loadData.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- Middleware ---
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());

// CORS: allow explicit origin if provided, else permissive for local dev
const allowOrigin = process.env.CLIENT_ORIGIN || '*';
app.use(
  cors({
    origin: allowOrigin === '*' ? true : allowOrigin,
    credentials: false,
  })
);

// --- Data store bootstrap ---
let store = Object.create(null);
let loadedAt = null;
try {
  store = await loadAllData();
  loadedAt = new Date();
  console.log(
    `[data] loaded datasets: ${Object.keys(store).join(', ') || 'none'}`
  );
} catch (err) {
  console.error('[data] failed to load datasets at startup:', err);
  store = Object.create(null);
}

// Helper: ensure data present
function ensureLoaded(req, res, next) {
  if (!store || Object.keys(store).length === 0) {
    return res.status(503).json({ error: 'Data not loaded yet' });
  }
  next();
}

// --- API Router ---
const api = express.Router();

// Health
api.get('/health', (req, res) => {
  res.json({
    ok: true,
    datasets: Object.keys(store || {}),
    loadedAt: loadedAt ? loadedAt.toISOString() : null,
    env: process.env.NODE_ENV || 'development',
  });
});

// Summary (counts, basic stats)
api.get('/summary', ensureLoaded, (req, res) => {
  res.json(getDatasetsSummary(store));
});

// Raw endpoints
api.get('/conditions', ensureLoaded, (req, res) =>
  res.json(store.conditions || [])
);
api.get('/factors', ensureLoaded, (req, res) =>
  res.json(store.factors || [])
);
api.get('/performance', ensureLoaded, (req, res) =>
  res.json(store.performance || [])
);
api.get('/treatment', ensureLoaded, (req, res) =>
  res.json(store.treatment || [])
);

// Group endpoint (?ds=factors&by=State)
api.get('/group', ensureLoaded, (req, res) => {
  const { ds = 'factors', by } = req.query;
  const data = store[ds] || [];
  if (!by) {
    return res.status(400).json({ error: "Query param 'by' is required" });
  }
  const groups = new Map();
  for (const row of data) {
    const raw = row?.[by];
    const key =
      raw === undefined || raw === null || String(raw).trim() === ''
        ? 'Unknown'
        : String(raw);
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const out = Array.from(groups.entries()).map(([k, count]) => ({
    key: k,
    count,
  }));
  res.json(out);
});

// 404 for unknown API routes
api.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Attach under /api
app.use('/api', api);

// --- Static client (production) ---
const clientDist = path.join(__dirname, '..', 'client', 'dist');

function serveClientIfPresent() {
  try {
    // cheap existence check
    const indexPath = path.join(clientDist, 'index.html');
    app.use(express.static(clientDist, { extensions: ['html'] }));
    // SPA fallback (but never swallow /api/*)
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(indexPath, (err) => {
        if (err) next();
      });
    });
    console.log(`[web] serving static client from: ${clientDist}`);
  } catch (e) {
    console.warn(
      `[web] client build not found at ${clientDist}. API will still run.`
    );
  }
}

serveClientIfPresent();

// --- Error handler (last) ---
app.use((err, req, res, _next) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start ---
const PORT = process.env.PORT || 5174;
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`[server] received ${sig}, shutting down...`);
    server.close(() => process.exit(0));
    // force exit after 5s
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
