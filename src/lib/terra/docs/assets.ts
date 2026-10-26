/** Uploads, assembles, and downloads Docs assets. */
import { actions } from '../runtime/action-proxy.js';
import { warn } from '../runtime/runtime.js';

const ASSET_CHUNK_SIZE_BYTES = 0.9 * 1024 * 1024;

export async function uploadAssetChunked(
  file: File,
  dPath: string,
  opts?: {
    resize?: boolean;
    grayscale?: boolean;
    previewAssetPath?: string;
    onProgress?: (data: {
      bytes: number;
      currentChunk: number;
      totalChunks: number;
      message?: string;
    }) => void;
  },
): Promise<{ path?: string; src?: string; compressedSize?: number; name?: string }> {
  const totalChunks = Math.ceil(file.size / ASSET_CHUNK_SIZE_BYTES) || 1;
  let finalAsset: { path?: string; src?: string; compressedSize?: number; name?: string } | null =
    null;
  for (let c = 0; c < totalChunks; c++) {
    const chunk = file.slice(c * ASSET_CHUNK_SIZE_BYTES, (c + 1) * ASSET_CHUNK_SIZE_BYTES);
    const formData = new FormData();
    formData.append('file', new File([chunk], file.name, { type: file.type }));
    formData.append('path', dPath);
    formData.append(
      'fileId',
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    );
    formData.append('chunkIndex', String(c));
    formData.append('totalChunks', String(totalChunks));
    if (opts?.resize) formData.append('resize', 'true');
    if (opts?.grayscale) formData.append('grayscale', 'true');
    if (opts?.previewAssetPath) formData.append('assetPath', opts.previewAssetPath);
    try {
      // native Astro Actions client automatically handles multipart/form-data encoding and routing!
      const { data, error } = await actions.write.asset.upload(formData);
      if (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' &&
                error !== null &&
                'message' in error &&
                typeof error.message === 'string'
              ? error.message
              : 'Action rejected the payload';
        throw new Error(message);
      }
      if (c === totalChunks - 1)
        finalAsset = data as {
          path?: string;
          src?: string;
          compressedSize?: number;
          name?: string;
        };
      if (opts?.onProgress)
        opts.onProgress({ bytes: chunk.size, currentChunk: c + 1, totalChunks });
    } catch (err) {
      console.error(`[uploadAssetChunked] Error on chunk ${c}:`, err);
      throw err;
    }
  }
  if (!finalAsset) throw new Error('Upload failed to return final attachment.');
  return finalAsset;
}

/**
 * Handles download.
 *
 * @param filename - Filename input supplied to download's operation.
 * @param content - Content input supplied to download's operation.
 * @param type - Type input supplied to download's operation.
 */
export function download(
  filename: string,
  content: string | ArrayBuffer | Blob,
  type = 'text/plain',
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    warn('download', 'Bypass requested execution; environment window context is dead.');
    return;
  }
  let dlName = filename;
  if (
    type === 'text/markdown' &&
    !dlName.toLowerCase().endsWith('.md') &&
    !dlName.toLowerCase().endsWith('.mdx')
  )
    dlName += '.mdx';
  const href = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const link = document.createElement('a');
  link.href = href;
  link.download = dlName;
  link.click();
  URL.revokeObjectURL(href);
}
