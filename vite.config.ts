import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({mode}) => {
  // Do NOT inject any API keys or secrets here. All secrets stay on the server (see server/config.ts).
  // Only VITE_* env vars are exposed to the client; use them only for public config (e.g. VITE_API_BASE_URL, VITE_FIREBASE_*).
  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
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
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true' ? { port: process.env.VITE_HMR_PORT ? Number(process.env.VITE_HMR_PORT) : 24679 } : false,
    },
  };
});
