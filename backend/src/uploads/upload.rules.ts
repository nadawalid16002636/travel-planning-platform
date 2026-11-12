export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const UPLOAD_PURPOSES = ['airline-logo', 'hotel', 'post', 'activity'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

/** GEN-08: 1 airline logo, 5 images on a hotel, post or activity. */
export const UPLOAD_LIMITS: Record<UploadPurpose, number> = {
  'airline-logo': 1,
  hotel: 5,
  post: 5,
  activity: 5,
};

export type ImageKind = 'jpeg' | 'png';

export function inspectImage(buffer: Buffer, declaredMime?: string): ImageKind {
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('size');
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    if (declaredMime && declaredMime !== 'image/jpeg') throw new Error('type');
    return 'jpeg';
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= png.length && buffer.subarray(0, png.length).equals(png)) {
    if (declaredMime && declaredMime !== 'image/png') throw new Error('type');
    return 'png';
  }
  throw new Error('type');
}
