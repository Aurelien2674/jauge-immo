import { dvfCsvToVentes } from "../../shared/dvf.js";
import type { Vente } from "../../shared/types.js";
import { fetchWithTimeout } from "./http.js";
import { supabaseAdmin } from "./supabase.js";

const GEO = "https://geo.api.gouv.fr";
const CACHE_JOURS = 30;

export interface Commune { code: string; nom: string; codesPostaux?: string[]; centre?: { coordinates: [number, number] } }

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function geo(path: string): Promise<Commune[]> {
  const r = await fetchWithTimeout(`${GEO}${path}`, {}, 6000);
  if (!r.ok) return [];
  const d = await r.json();
  return Array.isArray(d) ? d : d ? [d] : [];
}

export async function resoudreCommune(q: { insee?: string; cp?: string; ville?: string; lat?: number; lon?: number }): Promise<Commune | null> {
  const f = "fields=nom,code,codesPostaux,centre&type=commune-actuelle,arrondissement-municipal";
  let list: Commune[] = [];
  if (q.insee) list = await geo(`/communes/${encodeURIComponent(q.insee)}?fields=nom,code,codesPostaux,centre`);
  if (!list.length && q.cp) list = await geo(`/communes?codePostal=${encodeURIComponent(q.cp)}&${f}`);
  if (!list.length && q.lat && q.lon) list = await geo(`/communes?lat=${q.lat}&lon=${q.lon}&${f}`);
  if (!list.length && q.ville) list = await geo(`/communes?nom=${encodeURIComponent(q.ville)}&boost=population&limit=5&${f}`);
  if (!list.length) return null;
  // Paris, Lyon, Marseille : les ventes sont publiées par arrondissement
  const arr = list.filter((c) => /^(751|6938|132)\d\d$/.test(c.code));
  if (arr.length) list = arr;
  if (q.ville && list.length > 1) {
    const v = norm(q.ville);
    const hit = list.find((c) => norm(c.nom) === v) || list.find((c) => norm(c.nom).includes(v) || v.includes(norm(c.nom)));
    if (hit) return hit;
  }
  return list[0];
}

const dep = (insee: string) => (insee.startsWith("97") ? insee.slice(0, 3) : insee.slice(0, 2));

async function telechargerVentes(insee: string): Promise<Vente[]> {
  const an = new Date().getFullYear();
  const annees = [an, an - 1, an - 2, an - 3, an - 4, an - 5];
  const res = await Promise.all(
    annees.map(async (y) => {
      try {
        const r = await fetchWithTimeout(`https://files.data.gouv.fr/geo-dvf/latest/csv/${y}/communes/${dep(insee)}/${insee}.csv`, {}, 12000);
        return r.ok ? dvfCsvToVentes(await r.text()) : [];
      } catch {
        return [];
      }
    })
  );
  return res.flat().sort((a, b) => (a.d < b.d ? 1 : -1));
}

export async function ventesCommune(insee: string): Promise<{ ventes: Vente[]; cache: boolean }> {
  const sb = supabaseAdmin();
  if (sb) {
    const { data } = await sb.from("dvf_cache").select("ventes, fetched_at").eq("insee", insee).maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < CACHE_JOURS * 864e5) return { ventes: data.ventes as Vente[], cache: true };
  }
  const ventes = await telechargerVentes(insee);
  if (sb && ventes.length) await sb.from("dvf_cache").upsert({ insee, ventes, fetched_at: new Date().toISOString() });
  return { ventes, cache: false };
}

