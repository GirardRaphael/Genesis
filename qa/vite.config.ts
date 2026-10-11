import { mergeConfig } from '../apps/web/node_modules/vite';
import application from '../apps/web/vite.config';

const directory = process.env.GENESIS_QA_DIRECTORY;
if (!directory) throw new Error('Start the isolated frontend through qa/start_isolated.py');

// Keep the operator's port8000 proxy untouched; this frontend only reaches fixture state.
export default mergeConfig(application, {
  envDir: false,
  cacheDir: `${directory}/vite-cache`,
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8061',
        configure(proxy) {
          proxy.on('proxyReq', (outgoing, request) => {
            // Translate only the exact fixture origin; the production guard still rejects others.
            if (request.headers.origin === 'http://127.0.0.1:5174') {
              outgoing.setHeader('origin', 'http://127.0.0.1:5173');
            }
          });
        },
      },
    },
  },
});
