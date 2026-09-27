import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import {
  checkSupabaseConnection,
  isSupabaseConfigured,
  getIntegrationDiagnostics,
} from './config/supabase';
import { isTestEnvironment } from './config/runtimeEnv';
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
import authRouter from './routes/auth.routes';
import { referenceMirrorEnabled } from './config/geographySourceRegistry';
import { isVillageDatabasePopulated, buildVillageDatabase, isVillageBuilding } from './services/villageStorageEngine';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Builds the complete API application.
 *
 * Exported (and side-effect free) so the test suite can mount exactly the same
 * routers on an ephemeral port. The "live HTTP" tests used to address the
 * developer's running server on :3001 instead, which made them depend on
 * something outside the test run — and, worse, on that server accepting
 * client-chosen role headers.
 */
export function createApiApp() {
  const app = express();

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Request logger for API calls — silent under the test harness, where the
  // suite would otherwise print one line per assertion request.
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api') && !isTestEnvironment()) {
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
  // Account/session routes are mounted before the generic `/api` mounts so that
  // `/api/auth/*` is never swallowed by a broader router.
  app.use('/api/auth', authRouter);
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

  // Serve built frontend assets in production
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath));

  // Fallback 404 for unmatched API routes
  app.use('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // SPA fallback for client routing (non-API routes)
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    const indexPath = path.join(distPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        next();
      }
    });
  });

  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server Error]', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
    });
  });

  return app;
}

const app = createApiApp();
const PORT = process.env.PORT || 3001;

// Start listening only when this file is the entry point. Importing it (the
// test helper does) must not bind a port as a side effect.
let server: any;
if (import.meta.main) {
  try {
    server = app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`  BhoomiSetu API Server running on http://localhost:${PORT}`);
      console.log(`  Supabase configured: ${isSupabaseConfigured ? 'YES' : 'PENDING CREDENTIALS'}`);
      console.log(`======================================================\n`);

      // Auto-provision village reference storage engine on cold start if not yet populated
      if (!isTestEnvironment() && referenceMirrorEnabled() && !isVillageDatabasePopulated() && !isVillageBuilding()) {
        console.log('[Server] Cold start: Initializing reference village storage engine in background...');
        buildVillageDatabase((processed) => {
          if (processed % 100000 === 0) {
            console.log(`[Server] Streaming village reference engine: ${processed.toLocaleString()} records indexed...`);
          }
        })
          .then((res) => {
            console.log(`[Server] Reference village storage engine ready (${res.total.toLocaleString()} records).`);
          })
          .catch((err) => {
            console.error('[Server] Village reference engine initialization failed:', err);
          });
      }
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
}

export default app;
export { server };
