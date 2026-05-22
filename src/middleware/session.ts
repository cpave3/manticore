import { createMiddleware } from 'hono/factory';

const MAX_SESSION_ID_LENGTH = 1024;

export function extractSessionId() {
  return createMiddleware(async (c, next) => {
    const raw = c.req.header('X-Session-Id');
    let sessionId: string | null = null;
    if (raw != null) {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        sessionId = trimmed.length > MAX_SESSION_ID_LENGTH
          ? trimmed.slice(0, MAX_SESSION_ID_LENGTH)
          : trimmed;
      }
    }
    c.set('sessionId', sessionId);
    await next();
  });
}

declare module 'hono' {
  interface ContextVariableMap {
    sessionId: string | null;
  }
}
