import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from '../../server/createApp';

const app = createApp();

export const api = onRequest(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 10,
    invoker: 'public',
  },
  app
);
