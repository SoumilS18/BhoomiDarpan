import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import {
  checkSupabaseConnection,
  isSupabaseConfigured,
  getIntegrationDiagnostics,
} from './config/supabase';
import casesRouter from './routes/cases.routes';
import workflowsRouter from './routes/workflows.routes';
import projectsRouter from './routes/projects.routes';
import analyticsRouter from './routes/analytics.routes';
import documentsRouter from './routes/documents.routes';
import gisRouter from './routes/gis.routes';
import intelligenceRouter from './routes/intelligence.routes';
import policyRouter from './routes/policy.routes';
import notificationsRouter from './routes/notifications.routes';
import integrationsRouter from './routes/integrations.routes';
import { administrationRouter } from './routes/administration.routes';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Request logger for API calls
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// System & Health Status endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  const diagnostics = await getIntegrationDiagnostics();
  res.json({
    status: diagnostics.status,
    timestamp: diagnostics.timestamp,
    database: {
      connected: diagnostics.supabase.database_reachable,
      message: diagnostics.supabase.message,
    },
    is_supabase_configured: diagnostics.supabase.configured,
    has_gemini_key: diagnostics.gemini.configured,
    diagnostics,
  });
});

// Full Integration Diagnostics endpoint
app.get('/api/diagnostics', async (_req: Request, res: Response) => {
  const diagnostics = await getIntegrationDiagnostics();
  res.json(diagnostics);
});

// API Routes
app.use('/api/cases', casesRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/portfolio', analyticsRouter);
app.use('/api/policies', policyRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/administration', administrationRouter);
app.use('/api/gis', gisRouter);
app.use('/api', documentsRouter);
app.use('/api', gisRouter);
app.use('/api', intelligenceRouter);
app.use('/api', integrationsRouter);
app.use('/api', administrationRouter);

// Fallback 404 for unmatched API routes
app.use('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start listening
let server: any;
try {
  server = app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  BhoomiSetu API Server running on http://localhost:${PORT}`);
    console.log(`  Supabase configured: ${isSupabaseConfigured ? 'YES' : 'PENDING CREDENTIALS'}`);
    console.log(`======================================================\n`);
  });
  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      // Server already running on port in test or dev environment
    } else {
      console.error('Server error:', e);
    }
  });
} catch {
  // Port in use
}

export default app;
export { server };
