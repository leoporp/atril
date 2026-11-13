-- Atril: configuración de Supabase. Pégalo completo en el SQL Editor y dale "Run".
-- Se puede correr más de una vez sin problema. No toca nada de Fibra ni de Trazo.

-- 1. Tabla con tus datos (un registro por cuenta)
create table if not exists public.atril_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.atril_state enable row level security;

drop policy if exists "atril leer lo propio" on public.atril_state;
drop policy if exists "atril crear lo propio" on public.atril_state;
drop policy if exists "atril actualizar lo propio" on public.atril_state;
drop policy if exists "atril borrar lo propio" on public.atril_state;
create policy "atril leer lo propio" on public.atril_state for select to authenticated using (auth.uid() = user_id);
create policy "atril crear lo propio" on public.atril_state for insert to authenticated with check (auth.uid() = user_id);
create policy "atril actualizar lo propio" on public.atril_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "atril borrar lo propio" on public.atril_state for delete to authenticated using (auth.uid() = user_id);

-- 2. Carpeta privada para tus grabaciones de 30 segundos (máximo 5 MB por audio)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atril-audio', 'atril-audio', false, 5242880, array['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "atril audio ver lo propio" on storage.objects;
drop policy if exists "atril audio subir lo propio" on storage.objects;
drop policy if exists "atril audio cambiar lo propio" on storage.objects;
drop policy if exists "atril audio borrar lo propio" on storage.objects;
create policy "atril audio ver lo propio" on storage.objects for select to authenticated
  using (bucket_id = 'atril-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "atril audio subir lo propio" on storage.objects for insert to authenticated
  with check (bucket_id = 'atril-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "atril audio cambiar lo propio" on storage.objects for update to authenticated
  using (bucket_id = 'atril-audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'atril-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "atril audio borrar lo propio" on storage.objects for delete to authenticated
  using (bucket_id = 'atril-audio' and (storage.foldername(name))[1] = auth.uid()::text);
