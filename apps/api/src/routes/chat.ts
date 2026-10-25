import { ChatRequest } from '@notes/shared';
import type { FastifyInstance } from 'fastify';
import type { Ai } from '../ai/provider';
import { currentUser } from '../auth';
import type { Db } from '../db';
import { llmRateLimit } from './rateLimit';
import { chatArgs } from '../domain/chat/agent';
import { isTodayPlausible } from '../domain/notes/note';

export function chatRoutes(app: FastifyInstance, db: Db, ai: Ai): void {
  app.post('/chat', { config: llmRateLimit }, async (req, reply) => {
    const body = ChatRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!isTodayPlausible(body.data.today)) return reply.code(400).send({ error: 'invalid_today' });
    const result = ai.chat(chatArgs({ db, userId: currentUser(req).id }, body.data));
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'access-control-allow-origin': req.headers.origin ?? '*',
    });
    try {
      for await (const part of result.toUIMessageStream()) {
        raw.write(`data: ${JSON.stringify(part)}\n\n`);
      }
    } catch (err) {
      req.log.error(err);
      raw.write(`data: ${JSON.stringify({ type: 'error', errorText: 'chat_failed' })}\n\n`);
    }
    raw.end();
  });
}
