import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
// Tests exercise the preview adapter; production builds set this to false (vite.config.ts).
export default defineConfig({define:{__DEMO_BUILD__:'true'},plugins:[react()],test:{environment:'jsdom',environmentOptions:{jsdom:{url:'http://localhost/'}},include:['tests/**/*.test.tsx'],testTimeout:20000}});
