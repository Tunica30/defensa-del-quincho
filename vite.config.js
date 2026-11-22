import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev`       -> HTTPS (certificado autofirmado) para abrir desde el Quest por Wi-Fi.
// `npm run dev:http`  -> HTTP plano, para usar con `adb reverse` (localhost cuenta como contexto seguro).
export default defineConfig(({ mode }) => ({
  base: './', // rutas relativas: sirve igual en GitHub Pages (usuario.github.io/repo/)
  plugins: mode === 'http' ? [] : [basicSsl()],
  server: {
    host: true, // escucha en la red local
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
}));
