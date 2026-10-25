import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'הפתקים שלי',
        short_name: 'הפתקים שלי',
        lang: 'he',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0b5c78',
        // Add icon-192.png and icon-512.png to public/ and list them here to make it installable.
        icons: [],
      },
    }),
  ],
  // The one .env / .env.example at the repo root.
  envDir: '../..',
  server: { port: 5173 },
  test: { environment: 'jsdom' },
});
