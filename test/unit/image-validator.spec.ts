import { describe, it, expect } from 'vitest';

import { ValidationError } from '../../src/core/errors/app-error';
import {
  inspectImageBuffer,
  validateImageBuffer,
  contentToImageBuffer,
  imageBufferToDataUri,
  MAX_IMAGE_SIZE_BYTES,
} from '../../src/modules/banking/utils/image-validator';

describe('ImageValidator - Cryptographic Magic Bytes & Security', () => {
  // Minimal valid magic bytes for test fixtures
  const validPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const validJpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const validWebpHeader = Buffer.from([
    0x52,
    0x49,
    0x46,
    0x46, // "RIFF"
    0x24,
    0x00,
    0x00,
    0x00, // file size
    0x57,
    0x45,
    0x42,
    0x50, // "WEBP"
    0x56,
    0x50,
    0x38,
    0x20, // "VP8 "
  ]);

  it('1. should identify valid PNG magic bytes', () => {
    const result = inspectImageBuffer(validPngHeader);
    expect(result.isValid).toBe(true);
    expect(result.mimeType).toBe('image/png');
    expect(validateImageBuffer(validPngHeader)).toBe('image/png');
  });

  it('2. should identify valid JPEG magic bytes', () => {
    const result = inspectImageBuffer(validJpegHeader);
    expect(result.isValid).toBe(true);
    expect(result.mimeType).toBe('image/jpeg');
    expect(validateImageBuffer(validJpegHeader)).toBe('image/jpeg');
  });

  it('3. should identify valid WebP magic bytes', () => {
    const result = inspectImageBuffer(validWebpHeader);
    expect(result.isValid).toBe(true);
    expect(result.mimeType).toBe('image/webp');
    expect(validateImageBuffer(validWebpHeader)).toBe('image/webp');
  });

  it('4. should reject fake extension attacks (e.g. executable/text renamed to .png)', () => {
    const fakeExecutable = Buffer.from('MZ\x90\x00\x03\x00\x00\x00This is an executable payload');
    const result = inspectImageBuffer(fakeExecutable);
    expect(result.isValid).toBe(false);
    expect(result.mimeType).toBeNull();
    expect(result.error).toContain('do not match valid PNG, JPEG, or WebP');

    expect(() => validateImageBuffer(fakeExecutable)).toThrow(ValidationError);
  });

  it('5. should reject empty buffers (0 bytes)', () => {
    const empty = Buffer.alloc(0);
    const result = inspectImageBuffer(empty);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('empty (0 bytes)');
  });

  it('6. should reject files exceeding maximum size (15MB limit)', () => {
    // Simulate oversized buffer metadata without allocating actual memory
    const oversizedBuffer = {
      length: MAX_IMAGE_SIZE_BYTES + 1024,
      [0]: 0x89,
      [1]: 0x50,
      [2]: 0x4e,
      [3]: 0x47,
      [4]: 0x0d,
      [5]: 0x0a,
      [6]: 0x1a,
      [7]: 0x0a,
    } as unknown as Buffer;

    const result = inspectImageBuffer(oversizedBuffer);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('exceeds maximum limit of 15MB');
  });

  it('7. should convert buffer to valid RFC 2397 Data URI for AI Vision models', () => {
    const dataUri = imageBufferToDataUri(validPngHeader, 'image/png');
    expect(dataUri.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUri).toContain(validPngHeader.toString('base64'));
  });

  it('8. should decode content from Data URI or Base64 string into buffer', () => {
    const dataUri = `data:image/jpeg;base64,${validJpegHeader.toString('base64')}`;
    const decoded = contentToImageBuffer(dataUri);
    expect(decoded.equals(validJpegHeader)).toBe(true);

    const base64Only = validJpegHeader.toString('base64');
    const decodedFromBase64 = contentToImageBuffer(base64Only);
    expect(decodedFromBase64.equals(validJpegHeader)).toBe(true);
  });
});
