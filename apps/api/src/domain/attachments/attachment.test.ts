import {
  ATTACHMENT_QUOTA_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_NAME_LENGTH,
  MAX_ATTACHMENTS_PER_NOTE,
} from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';
import { checkUpload, cleanName } from './attachment';

const base = { mime: 'application/pdf', size: 1000, count: 0, usedBytes: 0 };

describe('checkUpload', () => {
  it('accepts an allowed file within every limit', () => {
    expect(checkUpload(base)).toBeNull();
    expect(checkUpload({ ...base, size: MAX_ATTACHMENT_BYTES })).toBeNull();
  });
  it('rejects types outside the allowlist', () => {
    expect(checkUpload({ ...base, mime: 'image/svg+xml' })).toBe('unsupported_type');
    expect(checkUpload({ ...base, mime: 'text/html' })).toBe('unsupported_type');
  });
  it('rejects a file over the size limit', () => {
    expect(checkUpload({ ...base, size: MAX_ATTACHMENT_BYTES + 1 })).toBe('attachment_too_large');
  });
  it('rejects the file past the per-note count', () => {
    expect(checkUpload({ ...base, count: MAX_ATTACHMENTS_PER_NOTE - 1 })).toBeNull();
    expect(checkUpload({ ...base, count: MAX_ATTACHMENTS_PER_NOTE })).toBe('too_many_attachments');
  });
  it('rejects a file that would pass the user quota', () => {
    expect(checkUpload({ ...base, usedBytes: ATTACHMENT_QUOTA_BYTES - 1000 })).toBeNull();
    expect(checkUpload({ ...base, usedBytes: ATTACHMENT_QUOTA_BYTES - 999 })).toBe(
      'quota_exceeded',
    );
  });
});

describe('cleanName', () => {
  it('trims and keeps a plain name', () => {
    expect(cleanName('  report.pdf  ')).toBe('report.pdf');
  });
  it('replaces path separators and control characters', () => {
    expect(cleanName('../a\\b/c.txt')).toBe('.._a_b_c.txt');
    expect(cleanName('a\u0000b\nc.txt')).toBe('a_b_c.txt');
  });
  it('caps the length', () => {
    expect(cleanName('x'.repeat(500))?.length).toBe(MAX_ATTACHMENT_NAME_LENGTH);
  });
  it('is null when nothing is left', () => {
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('')).toBeNull();
  });
});
