import type { VercelRequest, VercelResponse } from "@vercel/node";
import { comparer, dvfCsvToVentes } from "../shared/dvf.js";
import type { Marche, TypeBien, Vente } from "../shared/types.js";
import { fetchWithTimeout, json, num } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";

const GEO = "https://geo.api.gouv.fr";
const CACHE_JOURS = 30;

interface Commune { code: string; nom: string; codesPostaux?: string[]; centre?: { coordinates: [number, number] } }

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function geo(path: string): Promise<Commune[]> {
  const r = await fetchWithTimeout(`${GEO}${path}`, {}, 6000);
  if (!r.ok) return [];
  const d = await r.json();
  return Array.isArray(d) ? d : d ? [d] : [];
}

async function resoudreCommune(q: { insee?: string; cp?: string; ville?: string; lat?: number; lon?: number }): Promise<Commune | null> {
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

async function ventesCommune(insee: string): Promise<{ ventes: Vente[]; cache: boolean }> {
  const sb = supabaseAdmin();
  if (sb) {
    const { data } = await sb.from("dvf_cache").select("ventes, fetched_at").eq("insee", insee).maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < CACHE_JOURS * 864e5) return { ventes: data.ventes as Vente[], cache: true };
  }
  const ventes = await telechargerVentes(insee);
  if (sb && ventes.length) await sb.from("dvf_cache").upsert({ insee, ventes, fetched_at: new Date().toISOString() });
  return { ventes, cache: false };
}

async function loyerCommune(insee: string, type: TypeBien, pieces?: number): Promise<Marche["loyer"]> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const ordre =
    type === "maison" ? ["maison"]
    : pieces && pieces <= 2 ? ["appartement_t12", "appartement"]
    : pieces && pieces >= 3 ? ["appartement_t3plus", "appartement"]
    : ["appartement"];
  const { data } = await sb.from("loyers").select("*").eq("insee", insee).in("type", ordre);
  if (!data?.length) return null;
  const row = ordre.map((t) => data.find((d) => d.type === t)).find(Boolean)!;
  return { m2: +row.loyer_m2, bas: row.bas_m2 ? +row.bas_m2 : undefined, haut: row.haut_m2 ? +row.haut_m2 : undefined, nbObs: row.nb_obs ?? undefined, millesime: row.millesime ?? undefined, type: row.type };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = req.query;
  const type: TypeBien = q.type === "maison" ? "maison" : "appartement";
  const lat = num(q.lat), lon = num(q.lon), surface = num(q.surface), pieces = num(q.pieces);
  try {
    const commune = await resoudreCommune({
      insee: typeof q.insee === "string" ? q.insee : undefined,
      cp: typeof q.cp === "string" ? q.cp.trim() : undefined,
      ville: typeof q.ville === "string" ? q.ville.trim() : undefined,
      lat, lon,
    });
    if (!commune) return json(res, 404, { erreur: "Commune introuvable. Vérifiez le code postal ou la ville." });

    const [{ ventes }, loyer] = await Promise.all([ventesCommune(commune.code), loyerCommune(commune.code, type, pieces)]);
    const cmp = comparer(ventes, { type, surface, lat, lon });

    const avertissements: string[] = [];
    if (!ventes.length) avertissements.push("Aucune vente publiée pour cette commune dans les données DVF (l'Alsace, la Moselle et Mayotte n'y figurent pas).");
    else if (cmp.stats && cmp.stats.n < 8) avertissements.push(`Seulement ${cmp.stats.n} ventes comparables : la comparaison est fragile.`);
    if (!loyer) avertissements.push("Loyer de marché non disponible pour cette commune.");

    const out: Marche = {
      commune: {
        insee: commune.code, nom: commune.nom, cp: commune.codesPostaux?.[0],
        lon: commune.centre?.coordinates[0], lat: commune.centre?.coordinates[1],
      },
      ...cmp,
      loyer,
      avertissements,
    };
    return json(res, 200, out, 3600);
  } catch (e: any) {
    return json(res, 502, { erreur: "Les données publiques n'ont pas répondu. Réessayez dans un instant.", detail: String(e?.message ?? e) });
  }
}
