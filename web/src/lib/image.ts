export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_EDGE = 1568; // longest side sent to the model
export const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

export interface PreparedFile {
  blob: Blob;
  contentType: string;
  fileName: string;
}

/**
 * Validate and prepare a file for upload.
 * - Rejects unsupported types and >10 MB files.
 * - Downscales images to <=1568px longest side and re-encodes as JPEG to cut
 *   Bedrock token burn + latency. PDFs pass through untouched.
 */
export async function prepareFile(file: File): Promise<PreparedFile> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Unsupported file type. Please upload a PDF, PNG, or JPEG.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File is too large (max 10 MB).');
  }

  if (file.type === 'application/pdf') {
    return { blob: file, contentType: file.type, fileName: file.name };
  }

  const downscaled = await downscaleImage(file);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'note';
  return { blob: downscaled, contentType: 'image/jpeg', fileName: `${baseName}.jpg` };
}

async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const scale = longest > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longest : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not process image.');
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed.'))),
      'image/jpeg',
      0.85,
    );
  });
}
