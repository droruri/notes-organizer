import { ChatRequest } from '@notes/shared';
import type { FastifyInstance } from 'fastify';
import type { Ai } from '../ai/provider';
import { currentUser } from '../auth';
import type { Db } from '../db';
import { llmRateLimit } from './rateLimit';
import { chatArgs, proposedActions } from '../domain/chat/agent';
import { isTodayPlausible } from '../domain/notes/note';

export function chatRoutes(app: FastifyInstance, db: Db, ai: Ai, webOrigin: string): void {
  app.post('/chat', { config: llmRateLimit }, async (req, reply) => {
    const body = ChatRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!isTodayPlausible(body.data.today)) return reply.code(400).send({ error: 'invalid_today' });
    let result: ReturnType<Ai['chat']>;
    try {
      result = ai.chat(await chatArgs({ db, userId: currentUser(req).id }, body.data));
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'chat_failed' });
    }
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'access-control-allow-origin': webOrigin,
    });
    try {
      for await (const part of result.toUIMessageStream()) {
        raw.write(`data: ${JSON.stringify(part)}\n\n`);
        for (const action of proposedActions(part)) {
          raw.write(`data: ${JSON.stringify({ type: 'data-actions', data: [action] })}\n\n`);
        }
      }
    } catch (err) {
      req.log.error(err);
      raw.write(`data: ${JSON.stringify({ type: 'error', errorText: 'chat_failed' })}\n\n`);
    }
    raw.end();
  });
}
