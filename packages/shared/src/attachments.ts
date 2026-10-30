import { z } from 'zod';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_NOTE = 20;
/** Total attachment bytes one user may store. */
export const ATTACHMENT_QUOTA_BYTES = 30 * 1024 * 1024;
export const MAX_ATTACHMENT_NAME_LENGTH = 200;

/** Declared types the API accepts. No SVG, HTML or anything a browser runs as a page. */
export const ATTACHMENT_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

/** Error codes of `POST /notes/:id/attachments`. */
export const AttachmentError = z.enum([
  'not_found',
  'invalid_body',
  'attachment_too_large',
  'unsupported_type',
  'too_many_attachments',
  'quota_exceeded',
]);
export type AttachmentError = z.infer<typeof AttachmentError>;

/** Metadata only; the bytes come from `GET /notes/:id/attachments/:attachmentId`. */
export const Attachment = z.object({
  id: z.uuid(),
  name: z.string(),
  mime: z.string(),
  size: z.number().int(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof Attachment>;
