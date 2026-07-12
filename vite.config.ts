import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  build: {
    // Nunca publicar source maps en producción: exponen el código fuente
    // original (lógica de negocio, estructura interna) a cualquier visitante.
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Separa las librerías grandes en chunks propios. Como Vite les pone
        // hash al nombre, el navegador las cachea "para siempre" y solo
        // vuelve a descargar el chunk de la app (pequeño) en cada despliegue —
        // las librerías solo se re-descargan cuando actualizamos versiones.
        codeSplitting: {
          groups: [
            { name: 'recharts', test: /node_modules[\\/](recharts|d3-|victory-)/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)/ },
          ],
        },
      },
    },
  },
})
