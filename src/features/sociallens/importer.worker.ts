import { parseInstagramZip } from './importer-parser';

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const preview = await parseInstagramZip(event.data, message =>
      self.postMessage({ type: 'progress', message })
    );
    self.postMessage({ type: 'success', preview });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message:
        error instanceof Error ? error.message : 'Die ZIP-Datei konnte nicht gelesen werden.',
    });
  }
};
