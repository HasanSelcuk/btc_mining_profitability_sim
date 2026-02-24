import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwind from "@tailwindcss/vite"

export default defineConfig({
  plugins: [svelte(), tailwind()],
  base: './', // Başına nokta koyarak "neredeysem oradan başla" diyoruz
})
