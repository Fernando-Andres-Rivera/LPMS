# Despliegue de LPMS

La aplicación es un frontend estático (Vite + React) que habla directamente con
Supabase. No hay servidor propio que administrar: se compila a archivos estáticos
y se sirven desde Vercel. Toda la seguridad vive en las políticas RLS de Supabase.

## 1. Subir el código a GitHub

El repositorio ya está inicializado localmente. Falta conectarlo a un remoto:

```bash
# Crea un repositorio vacío en github.com/<tu-cuenta>/lpms (privado)
git remote add origin https://github.com/<tu-cuenta>/lpms.git
git push -u origin main
```

> El `.env` con la llave de Supabase **no** se sube — está en `.gitignore`. Las
> variables de entorno se configuran directamente en Vercel (paso 3).

## 2. Importar el proyecto en Vercel

1. En [vercel.com](https://vercel.com) → **Add New → Project → Import Git Repository**.
2. Elige el repositorio `lpms`.
3. Vercel detecta **Vite** automáticamente. No cambies nada:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. El archivo `vercel.json` ya incluido redirige todas las rutas a `index.html`
   (necesario para que los enlaces profundos y el "recargar página" funcionen).

## 3. Configurar las variables de entorno en Vercel

En **Project Settings → Environment Variables**, agrega las dos (mismos valores
que tu `.env` local):

| Nombre | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://lnpjznpnmrstkgexuyre.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | tu `sb_publishable_...` (la llave *publishable*, segura de exponer) |

Marca ambas para los entornos **Production**, **Preview** y **Development**.
Luego **Deploy**.

## 4. Registrar la URL de Vercel en Supabase

Cuando Vercel te dé la URL final (ej. `https://lpms.vercel.app`):

- Supabase → **Authentication → URL Configuration** → agrega esa URL en
  **Site URL** y en **Redirect URLs**.

Sin esto, el login por correo/contraseña funciona igual, pero cualquier flujo
futuro de recuperación de contraseña o confirmación por correo apuntaría a la
URL equivocada.

## 5. Despliegues siguientes

Cada `git push` a `main` dispara un despliegue automático en producción. Cada
push a otra rama genera una **Preview** con su propia URL — útil para revisar un
cambio con un cliente antes de publicarlo.

## Nota sobre las migraciones de base de datos

Las migraciones en `supabase/migrations/` se corren manualmente en el **SQL
Editor** de Supabase (no las aplica Vercel). El orden es por fecha en el nombre
del archivo. Al montar un entorno nuevo desde cero, se corren en ese orden, más
`supabase/seed.sql` para el catálogo de ejes.
