import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',   // important for packaged app
  // build: { outDir: 'dist' } // (default; you can omit)
})
