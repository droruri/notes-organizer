import { AUDIO_MIMES, NoteAnalyze, NoteCreate, NoteEdit } from '@notes/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Ai } from '../ai/provider';
import { currentUser } from '../auth';
import type { Db } from '../db';
import type { LinkReader } from '../domain/links/preview';
import { isTodayPlausible } from '../domain/notes/note';
import * as service from '../domain/notes/service';

const STATUS: Record<service.Failure, number> = {
  not_found: 404,
  invalid_transition: 422,
  unknown_taxonomy: 422,
  transcription_failed: 502,
  empty_transcript: 422,
};

const VoiceCreate = NoteCreate.omit({ body: true });

type Upload = { fields: Record<string, string>; audio: { mime: string; data: Buffer } | null };

/** Reads the `audio` file and the text fields; `too_large` over the size cap, `too_many` for a second file. */
async function readUpload(req: FastifyRequest): Promise<Upload | 'too_large' | 'too_many'> {
  const fields: Record<string, string> = {};
  let audio: Upload['audio'] = null;
  try {
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (typeof part.value === 'string') fields[part.fieldname] = part.value;
      } else if (part.fieldname === 'audio') {
        const mime = (part.mimetype.split(';')[0] ?? '').trim().toLowerCase();
        audio = { mime, data: await part.toBuffer() };
      } else {
        part.file.resume();
      }
    }
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'FST_REQ_FILE_TOO_LARGE') {
      return 'too_large';
    }
    if (err instanceof Error && 'code' in err && err.code === 'FST_FILES_LIMIT') return 'too_many';
    throw err;
  }
  return { fields, audio };
}

const Params = z.object({ id: z.uuid() });

export function notesRoutes(app: FastifyInstance, db: Db, ai: Ai, links: LinkReader): void {
  async function voiceNote(req: FastifyRequest, reply: FastifyReply) {
    const upload = await readUpload(req);
    if (upload === 'too_large') return reply.code(413).send({ error: 'audio_too_large' });
    if (upload === 'too_many') return reply.code(400).send({ error: 'invalid_body' });
    const input = VoiceCreate.safeParse(upload.fields);
    if (!input.success || !upload.audio || upload.audio.data.length === 0) {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    if (!(AUDIO_MIMES as readonly string[]).includes(upload.audio.mime)) {
      return reply.code(415).send({ error: 'unsupported_audio' });
    }
    if (!isTodayPlausible(input.data.today))
      return reply.code(400).send({ error: 'invalid_today' });
    const result = await service.createVoiceDraft(
      db,
      ai,
      links,
      currentUser(req).id,
      input.data,
      upload.audio,
    );
    if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
    const { created, note, suggestion } = result.value;
    return reply.code(created ? 201 : 200).send({ note, suggestion });
  }

  app.get('/notes', async (req) => service.listNotes(db, currentUser(req).id));

  app.post('/notes', async (req, reply) => {
    if (req.isMultipart()) return voiceNote(req, reply);
    const body = NoteCreate.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!isTodayPlausible(body.data.today)) return reply.code(400).send({ error: 'invalid_today' });
    const { created, note, suggestion } = await service.createDraft(
      db,
      ai,
      links,
      currentUser(req).id,
      body.data,
    );
    return reply.code(created ? 201 : 200).send({ note, suggestion });
  });

  app.patch('/notes/:id', async (req, reply) => {
    const params = Params.safeParse(req.params);
    // A malformed id can never match a row.
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const body = NoteEdit.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const result = await service.updateNote(db, currentUser(req).id, params.data.id, body.data);
    if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
    return result.value;
  });
  app.delete('/notes/:id', async (req, reply) => {
    const params = Params.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const result = await service.deleteNote(db, currentUser(req).id, params.data.id);
    if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
    return reply.code(204).send();
  });

  app.get('/notes/:id/audio', async (req, reply) => {
    const params = Params.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const audio = await service.getAudio(db, currentUser(req).id, params.data.id);
    if (!audio) return reply.code(404).send({ error: 'not_found' });
    return reply.type(audio.mime).send(audio.data);
  });

  app.post('/notes/:id/restore', async (req, reply) => {
    const params = Params.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const result = await service.restoreNote(db, currentUser(req).id, params.data.id);
    if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
    return result.value;
  });

  app.post('/notes/:id/analyze', async (req, reply) => {
    const params = Params.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const body = NoteAnalyze.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!isTodayPlausible(body.data.today)) return reply.code(400).send({ error: 'invalid_today' });
    const result = await service.analyzeNote(
      db,
      ai,
      links,
      currentUser(req).id,
      params.data.id,
      body.data,
    );
    if (!result.ok) return reply.code(STATUS[result.error]).send({ error: result.error });
    return result.value;
  });
}
