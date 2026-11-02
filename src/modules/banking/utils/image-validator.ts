import { ValidationError } from '../../../core/errors/app-error';

export type SupportedImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15 Megabytes

export interface ImageInspectionResult {
  isValid: boolean;
  mimeType: SupportedImageMimeType | null;
  sizeBytes: number;
  error?: string;
}

/**
 * Validates the cryptographic header magic bytes of an image buffer
 * to protect against renamed file attacks (e.g. executable renamed to .png).
 */
export function inspectImageBuffer(buffer: Buffer): ImageInspectionResult {
  const sizeBytes = buffer.length;

  if (sizeBytes === 0) {
    return {
      isValid: false,
      mimeType: null,
      sizeBytes: 0,
      error: 'Image file is empty (0 bytes)',
    };
  }

  if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    return {
      isValid: false,
      mimeType: null,
      sizeBytes,
      error: `Image size (${(sizeBytes / (1024 * 1024)).toFixed(2)}MB) exceeds maximum limit of 15MB`,
    };
  }

  // 1. Check PNG Magic Bytes: 89 50 4E 47 (\x89PNG)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, mimeType: 'image/png', sizeBytes };
  }

  // 2. Check JPEG Magic Bytes: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, mimeType: 'image/jpeg', sizeBytes };
  }

  // 3. Check WebP Magic Bytes: "RIFF" .... "WEBP"
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return { isValid: true, mimeType: 'image/webp', sizeBytes };
  }

  return {
    isValid: false,
    mimeType: null,
    sizeBytes,
    error: 'File contents do not match valid PNG, JPEG, or WebP image signature bytes',
  };
}

/**
 * Ensures the given buffer is a valid image or throws ValidationError.
 */
export function validateImageBuffer(buffer: Buffer): SupportedImageMimeType {
  const result = inspectImageBuffer(buffer);
  if (!result.isValid || !result.mimeType) {
    throw new ValidationError(result.error || 'Invalid image file format');
  }
  return result.mimeType;
}

/**
 * Normalizes input content into a raw Buffer.
 */
export function contentToImageBuffer(content: string | Buffer): Buffer {
  if (Buffer.isBuffer(content)) {
    return content;
  }
  if (typeof content === 'string') {
    if (content.startsWith('data:image/')) {
      const commaIndex = content.indexOf(',');
      const base64Data = commaIndex !== -1 ? content.slice(commaIndex + 1) : content;
      return Buffer.from(base64Data, 'base64');
    }
    // Check if it's base64 encoded
    return Buffer.from(content, 'base64');
  }
  throw new ValidationError('Unsupported image content format');
}

/**
 * Converts an image buffer to an RFC 2397 Data URI for multimodal Vision AI input.
 */
export function imageBufferToDataUri(buffer: Buffer, mimeType: SupportedImageMimeType): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
