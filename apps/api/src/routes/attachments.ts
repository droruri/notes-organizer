import { MAX_ATTACHMENT_BYTES } from '@notes/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../auth';
import type { Db } from '../db';
import * as service from '../domain/attachments/service';
import { readUpload } from './upload';

const STATUS = {
  not_found: 404,
  invalid_body: 400,
  attachment_too_large: 413,
  unsupported_type: 415,
  too_many_attachments: 422,
  quota_exceeded: 422,
} as const;

const NoteParams = z.object({ id: z.uuid() });
const FileParams = z.object({ id: z.uuid(), attachmentId: z.uuid() });

export function attachmentsRoutes(app: FastifyInstance, db: Db): void {
  app.post('/notes/:id/attachments', async (req, reply) => {
    const params = NoteParams.safeParse(req.params);
    // A malformed id can never match a row.
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    if (!req.isMultipart()) return reply.code(400).send({ error: 'invalid_body' });
    const upload = await readUpload(req, {
      field: 'file',
      limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
    });
    if (upload === 'too_large') return reply.code(413).send({ error: 'attachment_too_large' });
    if (upload === 'too_many' || !upload.file) {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    const result = await service.addAttachment(
      db,
      currentUser(req).id,
      params.data.id,
      upload.file,
    );
    if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
    return reply.code(201).send(result.value);
  });

  app.get('/notes/:id/attachments/:attachmentId', async (req, reply) => {
    const params = FileParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const file = await service.getAttachment(
      db,
      currentUser(req).id,
      params.data.id,
      params.data.attachmentId,
    );
    if (!file) return reply.code(404).send({ error: 'not_found' });
    return reply.type(file.mime).header('x-content-type-options', 'nosniff').send(file.data);
  });

  app.delete('/notes/:id/attachments/:attachmentId', async (req, reply) => {
    const params = FileParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const removed = await service.removeAttachment(
      db,
      currentUser(req).id,
      params.data.id,
      params.data.attachmentId,
    );
    if (!removed) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}
