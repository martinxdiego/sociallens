import type { ImportPreview } from './importer-parser';
export { IMPORT_LIMITS, parseInstagramZip } from './importer-parser';
export type { ImportPreview } from './importer-parser';

export interface ImportOptions {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

/** One worker per staged import. Cancellation and timeout release all decompression memory. */
export function importInstagramZip(
  file: File,
  options: ImportOptions = {}
): Promise<ImportPreview> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException('Import abgebrochen.', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./importer.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException('Import abgebrochen.', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      finish();
      reject(
        new Error(
          'Der Import dauert länger als zwei Minuten. Bitte nur Follower und Following exportieren.'
        )
      );
    }, 120_000);
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = () => {
      finish();
      reject(
        new Error('Der lokale Import konnte nicht abgeschlossen werden. Bitte die Datei prüfen.')
      );
    };
    worker.onmessage = (
      event: MessageEvent<{ type: string; message?: string; preview?: ImportPreview }>
    ) => {
      if (event.data.type === 'progress') {
        options.onProgress?.(event.data.message ?? 'Import läuft …');
        return;
      }
      finish();
      if (event.data.type === 'success' && event.data.preview) resolve(event.data.preview);
      else reject(new Error(event.data.message ?? 'Das ZIP konnte nicht gelesen werden.'));
    };
    worker.postMessage(file);
  });
}
