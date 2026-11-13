import { inspectImage, MAX_IMAGE_BYTES } from './upload.rules.js';

describe('GEN-08 image rules', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

  it('accepts PNG and JPEG magic bytes', () => {
    expect(inspectImage(png, 'image/png')).toBe('png');
    expect(inspectImage(jpeg, 'image/jpeg')).toBe('jpeg');
  });

  it('rejects a GIF and a mismatched mime type', () => {
    expect(() => inspectImage(Buffer.from('GIF89a'), 'image/gif')).toThrow('type');
    expect(() => inspectImage(png, 'image/jpeg')).toThrow('type');
  });

  it('rejects an empty file and a file over 5 MB', () => {
    expect(() => inspectImage(Buffer.alloc(0), 'image/png')).toThrow('size');
    expect(() => inspectImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png')).toThrow('size');
  });
});
