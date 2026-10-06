import { transferableAbortController } from 'node:util';
import { beforeEach, vi } from 'vitest';

// React Router creates native Request objects. Node's Request requires its own
// AbortSignal implementation, whereas jsdom supplies a separate DOM implementation.
const NodeAbortController = transferableAbortController().constructor;
beforeEach(() => { vi.stubGlobal('AbortController', NodeAbortController); });
