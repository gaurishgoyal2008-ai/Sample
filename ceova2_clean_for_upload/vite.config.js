import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [
    basicSsl()
  ],
  server: {
    host: true, // Listen on all network addresses (e.g. 0.0.0.0)
    port: 5173,
    https: true
  }
});
