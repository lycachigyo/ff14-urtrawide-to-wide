import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/ff14-urtrawide-to-wide/' : '/',
  plugins: [react()],
})
