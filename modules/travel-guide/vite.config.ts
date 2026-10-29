import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { fs: { deny: ['**/config/**', '**/.env*', '**/.git/**', '**/server/**', '**/server.mjs'] } }, build: { outDir: 'dist' } });
