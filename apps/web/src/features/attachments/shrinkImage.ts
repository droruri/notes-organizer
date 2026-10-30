const MAX_SIDE = 2048;
const MAX_BYTES = 1024 * 1024;
const QUALITY = 0.85;

/** The size to draw an image at so its longest side is at most `MAX_SIDE`; never enlarges. */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_SIDE) return { width, height };
  const scale = MAX_SIDE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Shrinks a photo over 1 MB or 2048 px to 2048 px JPEG (quality 0.85). GIFs, small images and
 * anything that fails to decode or encode come back unchanged.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = targetSize(bitmap.width, bitmap.height);
    const resized = width !== bitmap.width || height !== bitmap.height;
    if (!resized && file.size <= MAX_BYTES) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^./\\]+$/, '') + '.jpg', {
      type: 'image/jpeg',
    });
  } catch {
    return file;
  }
}
