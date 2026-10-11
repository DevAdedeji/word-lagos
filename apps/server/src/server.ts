import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { codeSchema } from '@word-lagos/multiplayer';
import { Auth, AuthError } from './auth';
import { Matches, MatchError } from './matches';
import type { Store } from './store';
import { friendRoom } from './room';
export async function startServer({
  store,
  auth,
  matches,
  port = 0,
  production = false,
  publicOrigin,
}: {
  store: Store;
  auth: Auth;
  matches: Matches;
  port?: number;
  production?: boolean;
  publicOrigin?: string;
}) {
  const app = express();
  app.disable('x-powered-by');
  // Railway supplies one trusted reverse proxy hop. Never trust arbitrary client IP headers locally.
  if (production) app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      'frame-ancestors https://lagoslife.app https://www.lagoslife.app https://naijalife.app https://www.naijalife.app https://lagoslife.eliysites.com',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/health', async (_req, res) => {
    try {
      await store.healthy();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  app.get('/api/config', (_req, res) => res.json({ authMode: auth.mode }));
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use(express.json({ limit: '8kb' }));
  const bearer = (req: express.Request) =>
    req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
  app.post('/api/local-player', async (_req, res, next) => {
    try {
      res.json(await auth.issueLocal());
    } catch (e) {
      next(e);
    }
  });
  app.post('/api/friends', async (req, res, next) => {
    try {
      const identity = await auth.verify(bearer(req));
      const match = await matches.create(identity);
      res.status(201).json({ code: match.code });
    } catch (e) {
      next(e);
    }
  });
  const connections = new Map<string, Promise<void>>();
  app.post('/api/friends/:code/connect', async (req, res, next) => {
    try {
      const code = codeSchema.parse(req.params.code);
      const session = bearer(req);
      const identity = await auth.verify(session);
      await matches.join(code, identity);
      const existing = connections.get(code);
      if (existing) await existing;
      else {
        const connection = (async () => {
          const rooms = await matchMaker.query({ roomId: code });
          if (!rooms.length) await matchMaker.createRoom('friend', { code, session });
        })();
        connections.set(code, connection);
        try {
          await connection;
        } finally {
          connections.delete(code);
        }
      }
      res.json({ code });
    } catch (e) {
      next(e);
    }
  });
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const known =
        error instanceof AuthError || error instanceof MatchError || error instanceof z.ZodError;
      if (!known) console.error(JSON.stringify({ event: 'request_failed' }));
      res.status(error instanceof AuthError ? 401 : known ? 400 : 500).json({
        error:
          error instanceof z.ZodError
            ? 'Enter a valid game code.'
            : known
              ? error.message
              : 'The server could not complete this request.',
      });
    },
  );
  const webRoot = fileURLToPath(new URL('../../web/dist', import.meta.url));
  app.use(express.static(webRoot));
  app.get('/', (_req, res) => res.sendFile(`${webRoot}/index.html`));
  const http = createServer(app);
  matchMaker.controller.exposedMethods = ['joinById'];
  matchMaker.controller.getCorsHeaders = () => ({
    'Access-Control-Allow-Origin': publicOrigin ?? 'http://127.0.0.1:43127',
  });
  const server = new Server({
    transport: new WebSocketTransport({
      server: http,
      maxPayload: 8192,
      verifyClient: ({ origin }: { origin: string }) =>
        !origin || origin === (publicOrigin ?? 'http://127.0.0.1:43127'),
    }),
    greet: false,
    gracefullyShutdown: false,
  });
  server.define('friend', friendRoom(auth, matches)).filterBy(['code']);
  await server.listen(port, production ? '0.0.0.0' : '127.0.0.1');
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('No listening address.');
  return { port: address.port, close: () => server.gracefullyShutdown(false) };
}
