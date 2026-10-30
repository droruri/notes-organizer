import {
  ATTACHMENT_MIMES,
  ATTACHMENT_QUOTA_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_NAME_LENGTH,
  MAX_ATTACHMENTS_PER_NOTE,
  type AttachmentError,
} from '@notes/shared';

// Pure upload rules. The only place the attachment limits are read.

/** Trims, replaces path separators and control characters with `_`, caps the length. Null when nothing is left. */
export function cleanName(name: string): string | null {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\\u0000-\u001f\u007f-\u009f]/g, '_')
    .trim()
    .slice(0, MAX_ATTACHMENT_NAME_LENGTH)
    .trim();
  return cleaned === '' ? null : cleaned;
}

/** `null` when the upload may be stored, else the failure to report. */
export function checkUpload(upload: {
  mime: string;
  size: number;
  count: number;
  usedBytes: number;
}): AttachmentError | null {
  if (!(ATTACHMENT_MIMES as readonly string[]).includes(upload.mime)) return 'unsupported_type';
  if (upload.size > MAX_ATTACHMENT_BYTES) return 'attachment_too_large';
  if (upload.count >= MAX_ATTACHMENTS_PER_NOTE) return 'too_many_attachments';
  if (upload.usedBytes + upload.size > ATTACHMENT_QUOTA_BYTES) return 'quota_exceeded';
  return null;
}
