import { createBackend } from './backend';
import type { Request } from './protocol';

const backend = createBackend((msg) => self.postMessage(msg));
self.onmessage = (e: MessageEvent<Request>) => {
  void backend.handle(e.data);
};
