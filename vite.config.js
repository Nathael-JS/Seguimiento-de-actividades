import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // La versión de package.json, visible al pie de la app
  define: { __VERSION__: JSON.stringify(version) },
})
