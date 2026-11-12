import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { subscribe, type LiveEvent } from '../../utils/events';

const router = Router();

const HEARTBEAT_MS = 25_000;

/**
 * GET /api/events — Server-Sent Events for staff screens. The client opens it
 * with fetch() so the usual "Authorization: Bearer" header works.
 */
router.get('/', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), (_req: Request, res: Response) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform', // no-transform: proxies must not compress (= buffer) it
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n: connected\n\n');

  const send = (event: LiveEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const unsubscribe = subscribe(send);
  // Comments keep idle connections (and the Next.js proxy) from timing out.
  const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  // res "close" = the connection ended (browser closed the page, network gone).
  // Not req "close": since Node 16 that fires as soon as the request was read.
  res.on('close', () => {
    clearInterval(beat);
    unsubscribe();
  });
});

export default router;
