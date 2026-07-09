# LPMS — Lean Performance Management System

Fase 1 (fundación): esquema multi-tenant, autenticación, CRUD de indicadores,
captura de mediciones, tablero por eje y vista de cascada.

## Estructura del proyecto

```
src/
  lib/            cliente de Supabase, tipos y utilidades (semáforo, etc.)
  hooks/          AuthContext / useAuth (sesión, perfil, sitios del usuario)
  components/
    ui/           componentes reutilizables: Semaforo, IndicatorCard, PeriodSelector
    layout/       AppLayout (sidebar + topbar)
  features/
    auth/         login, guards de ruta (RequireAuth, RequireRole)
    indicators/   CRUD de indicadores
    measurements/ captura de mediciones
    dashboard/    tablero por eje
    cascade/      vista de cascada (trazabilidad Nivel 1 → 2 → 3)
supabase/
  migrations/     esquema SQL + políticas RLS
  seed.sql        datos de demostración
```

## Puesta en marcha

### 1. Crear el proyecto en Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En el **SQL Editor**, ejecuta en orden:
   - `supabase/migrations/20260706000000_initial_schema.sql`
   - `supabase/migrations/20260706000001_rls_policies.sql`
   - `supabase/seed.sql`
3. Copia `.env.example` a `.env` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API en el panel de Supabase).

### 2. Crear usuarios de prueba

Los usuarios se crean en Supabase Auth y luego se les asocia una fila en `profiles`
(y en `profile_sites` si tienen sitio asignado). Desde **Authentication → Users** en
el panel de Supabase, crea un usuario por rol (con email/contraseña), copia su UUID,
y ejecuta en el SQL Editor (reemplazando `<uuid>` por el UUID real de cada usuario):

```sql
-- Admin de la consultora (ve todos los tenants)
insert into profiles (id, organization_id, role, full_name, email)
values ('<uuid>', '00000000-0000-0000-0000-000000000001', 'admin_consultora', 'Admin Consultora', 'admin.consultora@leanprologistic.com');

-- Gerente del tenant demo
insert into profiles (id, organization_id, role, full_name, email)
values ('<uuid>', '00000000-0000-0000-0000-000000000001', 'gerente', 'Gerente Demo', 'gerente@demo.com');

-- Operativo de la Planta Bogotá
insert into profiles (id, organization_id, role, full_name, email)
values ('<uuid>', '00000000-0000-0000-0000-000000000001', 'operativo', 'Operativo Demo', 'operativo@demo.com');
insert into profile_sites (profile_id, site_id)
values ('<uuid>', '10000000-0000-0000-0000-000000000001');
```

Repite para `admin_cliente` y `administrativo` si quieres probar los 5 roles.

### 3. Instalar y correr

```bash
npm install
npm run dev
```

## Cómo probar cada módulo

- **Auth**: entra a `/login` con un usuario creado arriba. Con sesión inválida,
  cualquier ruta protegida redirige a `/login`. Con un usuario `operativo`, el
  menú "Indicadores" no debe aparecer (y navegar a `/indicadores` a mano redirige
  a `/`).
- **CRUD de indicadores**: como `gerente` o `admin_cliente`, ve a "Indicadores" →
  "+ Nuevo indicador". Crea un indicador Nivel 2 del eje Seguridad y vincúlalo
  como padre de "Accidentes por turno" (o revisa que la cascada semilla ya
  vinculada aparezca marcada).
- **Captura de mediciones**: ve a "Captura de mediciones", elige un indicador,
  ingresa un valor para hoy y guarda. Vuelve a abrir la misma fecha/indicador:
  debe precargar el valor guardado (es un upsert por `indicador + fecha`).
- **Tablero por eje**: en la página de inicio ("Ejes"), entra al eje Seguridad.
  Debes ver las tarjetas de los 3 indicadores semilla con su semáforo y, tras
  capturar 2+ mediciones, una mini-tendencia.
- **Vista de cascada**: haz clic en cualquier tarjeta de indicador (o entra a
  `/cascada/<id>`). Desde "Accidentes por turno" (Nivel 1) debes ver arriba sus
  objetivos superiores (Nivel 2 y 3); desde el indicador Nivel 3 debes ver todos
  sus precursores en árbol.
- **Aislamiento multi-tenant (RLS)**: crea una segunda organización y un usuario
  perteneciente a ella; confirma que no puede ver ni los indicadores ni las
  mediciones de la organización demo.
