import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import os from 'os';

export default defineConfig({
  plugins: [
    basicSsl(),
    {
      name: 'network-ip-api',
      configureServer(server) {
        server.middlewares.use('/api/network-ip', (req, res) => {
          const interfaces = os.networkInterfaces();
          const ips = [];
          for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name] || []) {
              if (net.family === 'IPv4' && !net.internal) {
                ips.push({ name, address: net.address });
              }
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ips }));
        });
      }
    }
  ],
  server: {
    host: true, // Listen on all network addresses (0.0.0.0)
    port: 5173,
    https: true
  },
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        phone: './phone.html'
      }
    }
  }
});
