import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';
  const isVercel = Boolean(process.env.VERCEL);
  const repoName = 'Repro';

  const base = isGitHubPages ? `/${repoName}/` : '/';

  const appUrl =
    env.VITE_APP_URL ||
    (isGitHubPages
      ? `https://${process.env.GITHUB_REPOSITORY_OWNER}.github.io/${repoName}`
      : isVercel
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:5173');

  const isProd = mode === 'production';

  return {
    base,
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-env-replace',
        transformIndexHtml(html) {
          return html.replace(/%VITE_APP_URL%/g, appUrl);
        },
      },
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: false,
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https?:\/\/.*\/api\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/script\.google\.com\/.*/i,
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: {
      host: true,
      port: 5173,
      hmr: process.env.DISABLE_HMR !== 'true' ? { clientPort: 443 } : false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': { target: 'http://localhost:3000', changeOrigin: true },
      },
    },
    preview: { host: true, port: 4173 },
    build: {
      outDir: 'dist',
      sourcemap: isProd ? false : true,
      target: 'es2022',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            xlsx: ['xlsx'],
            pdf: ['jspdf'],
            motion: ['motion'],
            icons: ['lucide-react'],
            supabase: ['@supabase/supabase-js'],
            zod: ['zod'],
          },
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    esbuild: {
      drop: isProd ? ['debugger'] : [],
      pure: isProd ? ['console.log', 'console.info'] : [],
    },
  };
});
