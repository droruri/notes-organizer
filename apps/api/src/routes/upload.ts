import type { FastifyRequest } from 'fastify';

export type UploadLimits = { fileSize: number; files: number };

export type Upload = {
  fields: Record<string, string>;
  file: { name: string; mime: string; data: Buffer } | null;
};

/**
 * Reads the text fields and the file in `field`; `too_large` over `limits.fileSize`,
 * `too_many` past `limits.files`. Other files are drained and ignored.
 */
export async function readUpload(
  req: FastifyRequest,
  { field, limits }: { field: string; limits: UploadLimits },
): Promise<Upload | 'too_large' | 'too_many'> {
  const fields: Record<string, string> = {};
  let file: Upload['file'] = null;
  try {
    for await (const part of req.parts({ limits })) {
      if (part.type === 'field') {
        if (typeof part.value === 'string') fields[part.fieldname] = part.value;
      } else if (part.fieldname === field) {
        const mime = (part.mimetype.split(';')[0] ?? '').trim().toLowerCase();
        file = { name: part.filename, mime, data: await part.toBuffer() };
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
  return { fields, file };
}
