import { describe, expect, it } from 'vitest';
import { formatBytes, MAX_FILE_BYTES, validateFile } from './fileValidation';

const file = (name: string, size: number, type: string) => ({ name, size, type });

describe('validateFile', () => {
  it('accepts a PDF', () => {
    expect(validateFile(file('report.pdf', 1000, 'application/pdf'))).toEqual({
      ok: true,
      mimeType: 'application/pdf',
    });
  });

  it('accepts supported image types', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/tiff']) {
      expect(validateFile(file(`scan.${type.split('/')[1]}`, 1000, type)).ok).toBe(true);
    }
  });

  it('falls back to the extension when the browser reports no MIME type', () => {
    // Safari on iOS frequently hands over an empty `type`.
    expect(validateFile(file('scan.JPG', 1000, ''))).toEqual({ ok: true, mimeType: 'image/jpeg' });
  });

  it('rejects unsupported file types by name', () => {
    const result = validateFile(file('notes.docx', 1000, 'application/vnd.openxmlformats'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('notes.docx');
  });

  it('rejects an empty file', () => {
    const result = validateFile(file('empty.pdf', 0, 'application/pdf'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('empty');
  });

  it('rejects a file over the size limit and states both sizes', () => {
    const result = validateFile(file('huge.pdf', MAX_FILE_BYTES + 1, 'application/pdf'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('20.0 MB');
  });

  it('accepts a file exactly at the limit', () => {
    expect(validateFile(file('edge.pdf', MAX_FILE_BYTES, 'application/pdf')).ok).toBe(true);
  });
});

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
