import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      '/open': 'http://localhost:8080',
      '/close': 'http://localhost:8080',
      '/state': 'http://localhost:8080',
    },
  },
})
