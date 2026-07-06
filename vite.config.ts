import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Do NOT inject any API keys or secrets here. All secrets stay on the server (see server/config.ts).
  // Only VITE_* env vars are exposed to the client; use them only for public config (e.g. VITE_API_BASE_URL, VITE_FIREBASE_*).
  const env = loadEnv(mode, process.cwd(), '');
  const devApiPort = env.PORT || '5001';
  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      // Avoid duplicate React copies (would break Context: "useAuth must be used within AuthProvider").
      dedupe: ['react', 'react-dom'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'firebase';
              if (id.includes('react-dom')) return 'react-vendor';
              if (id.includes('react-router')) return 'router';
              if (id.includes('lucide-react')) return 'lucide';
              if (id.includes('@supabase')) return 'supabase';
              if (id.includes('motion') || id.includes('framer-motion')) return 'motion';
              if (id.includes('react-markdown') || id.includes('remark') || id.includes('mdast')) return 'markdown';
              if (id.includes('dompurify')) return 'dompurify';
              return 'vendor';
            }
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
      chunkSizeWarningLimit: 400,
    },
    server: {
      // When you run `vite` alone (port 5173), forward /api to Express (`npm run dev` uses PORT, default 5001).
      // Production uses Firebase Hosting rewrites; integrated dev uses only http://localhost:5001 — no proxy needed there.
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${devApiPort}`,
          changeOrigin: true,
          // Research report SSE can run several minutes (tools + LLM).
          timeout: 600_000,
          proxyTimeout: 600_000,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true' ? { port: process.env.VITE_HMR_PORT ? Number(process.env.VITE_HMR_PORT) : 24679 } : false,
    },
  };
});
