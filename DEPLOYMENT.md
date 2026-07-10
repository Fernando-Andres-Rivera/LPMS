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

---

# Buenas prácticas — dónde vive cada una

Referencia rápida de cómo está cubierta cada práctica y qué archivo o
plataforma la controla.

## Frontend comprimido, sin source maps

- **Source maps**: apagados explícitamente en `vite.config.ts`
  (`build.sourcemap: false`). El código fuente original nunca se publica.
- **Minificación**: Vite minifica JS y CSS en cada `npm run build`.
- **Compresión (gzip/brotli)**: la aplica Vercel automáticamente al servir —
  no requiere configuración en el repo.
- **División de chunks**: `vite.config.ts` separa React, Recharts y Supabase
  en archivos propios con hash. Al desplegar una nueva versión, el navegador
  del usuario solo descarga el chunk de la app (~27 KB gzip); las librerías
  (~235 KB gzip) quedan cacheadas hasta que actualicemos sus versiones.

## Seguridad de datos (RLS)

Toda la autorización vive en Postgres, no en el frontend: cada tabla tiene
políticas RLS por organización y rol (`supabase/migrations/*rls*.sql` y
posteriores). Un usuario autenticado solo puede leer/escribir datos de su
organización según su rol, sin importar desde qué herramienta llame a la API.
El aislamiento de escritura entre organizaciones se verificó con un ataque
simulado (migración `20260714000001_cross_org_write_isolation.sql`).

## Control de versiones

Git con despliegue continuo: cada push a `main` publica a producción; cada
rama genera una Preview URL en Vercel. Las migraciones de base de datos están
versionadas en `supabase/migrations/` con orden cronológico en el nombre.

## API para integraciones externas

Supabase expone automáticamente una **API REST (PostgREST)** sobre el esquema:
`https://<proyecto>.supabase.co/rest/v1/<tabla>`. Es la misma API que usa la
app, así que **hereda las políticas RLS** — una herramienta externa (Power BI,
un ERP, un script) necesita:

1. La URL del proyecto y la llave *publishable* (las mismas del `.env`).
2. Un usuario de la app (email/contraseña) con el rol adecuado; la herramienta
   se autentica contra `/auth/v1/token` y usa el JWT resultante.

La herramienta externa solo ve lo que ese usuario vería en la app. Para
integraciones de solo lectura conviene crear un usuario dedicado con rol
`operativo` o `administrativo` limitado a los sitios necesarios.

## Hosting y deployment

Frontend estático en Vercel (CDN global, HTTPS automático), base de datos y
auth en Supabase. No hay servidores propios que parchar. Los headers de
seguridad (HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy`, `Permissions-Policy`) se inyectan desde `vercel.json`.

## Rate limiting

Opera en dos capas de plataforma (no en el repo):

- **Supabase Auth**: límites por IP para login, registro y recuperación de
  contraseña, configurables en **Authentication → Rate Limits** del dashboard.
- **Vercel**: mitigación DDoS automática en el CDN para el frontend.

La API de datos (PostgREST) no tiene rate limiting por usuario en el plan
gratuito; si un cliente integra herramientas de alto volumen, el control es
el plan de Supabase (que limita conexiones y recursos del proyecto).

## Caché (rendimiento)

- **Assets estáticos**: `vercel.json` los sirve con
  `Cache-Control: immutable` por 1 año — es seguro porque Vite les pone hash
  al nombre; un archivo nuevo siempre tiene URL nueva.
- **`index.html`**: `no-cache`, para que cada despliegue llegue al instante a
  todos los usuarios.
- **Datos**: se consultan en vivo a Supabase en cada carga de página — es la
  decisión correcta para tableros de gestión diaria, donde ver una medición
  vieja es peor que esperar unos cientos de milisegundos. Las consultas
  pesadas de tableros ya están optimizadas con la vista `indicator_status` y
  consultas por lote (sin patrón N+1). Si con muchos clientes se sintiera
  lentitud, el siguiente paso sería una capa de caché de datos en el cliente
  (React Query/SWR) — no es necesaria hoy.
