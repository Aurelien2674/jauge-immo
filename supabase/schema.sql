-- Jauge Immo — schéma Supabase
-- À exécuter une fois dans Supabase > SQL Editor > New query > Run.

-- 1. Analyses enregistrées par les utilisateurs
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  titre text,
  url text,
  bien jsonb not null,
  marche jsonb,
  public boolean not null default false
);
create index if not exists analyses_user_idx on public.analyses(user_id, created_at desc);
alter table public.analyses enable row level security;

drop policy if exists "lire ses analyses ou les publiques" on public.analyses;
create policy "lire ses analyses ou les publiques" on public.analyses
  for select using (auth.uid() = user_id or public = true);
drop policy if exists "créer ses analyses" on public.analyses;
create policy "créer ses analyses" on public.analyses
  for insert with check (auth.uid() = user_id);
drop policy if exists "modifier ses analyses" on public.analyses;
create policy "modifier ses analyses" on public.analyses
  for update using (auth.uid() = user_id);
drop policy if exists "supprimer ses analyses" on public.analyses;
create policy "supprimer ses analyses" on public.analyses
  for delete using (auth.uid() = user_id);

-- 2. Cache des ventes DVF par commune (écrit uniquement par le serveur)
create table if not exists public.dvf_cache (
  insee text primary key,
  ventes jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.dvf_cache enable row level security;
-- aucune politique : seule la clé service (serveur) y accède

-- 3. Loyers de marché par commune (Carte des loyers, ministère du Logement)
create table if not exists public.loyers (
  insee text not null,
  type text not null check (type in ('appartement','appartement_t12','appartement_t3plus','maison')),
  libelle text,
  loyer_m2 numeric not null,
  bas_m2 numeric,
  haut_m2 numeric,
  nb_obs integer,
  millesime integer,
  primary key (insee, type)
);
alter table public.loyers enable row level security;
-- aucune politique : seule la clé service (serveur) y accède
