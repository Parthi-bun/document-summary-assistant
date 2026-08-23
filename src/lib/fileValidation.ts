export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
  'image/tiff',
] as const;

/** `accept` attribute for the file input. Extensions help Safari/iOS, which reports empty MIME types. */
export const ACCEPT_ATTRIBUTE = '.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,application/pdf,image/*';

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

export type ValidationResult = { ok: true; mimeType: string } | { ok: false; error: string };

/**
 * Validates a dropped or picked file. Falls back to the extension because some
 * browsers (notably Safari on iOS) hand us an empty `type` for valid files.
 */
export function validateFile(file: { name: string; size: number; type: string }): ValidationResult {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = file.type || EXTENSION_TO_MIME[extension] || '';

  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return {
      ok: false,
      error: `“${file.name}” is not a supported file. Upload a PDF or an image (PNG, JPG, WEBP, BMP or TIFF).`,
    };
  }

  if (file.size === 0) {
    return { ok: false, error: `“${file.name}” is empty — there is nothing to summarize.` };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`,
    };
  }

  return { ok: true, mimeType };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
