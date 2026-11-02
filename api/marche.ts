import type { VercelRequest, VercelResponse } from "@vercel/node";
import { comparer } from "../shared/dvf.js";
import type { Marche, TypeBien } from "../shared/types.js";
import { json, num } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";
import { resoudreCommune, ventesCommune } from "./_lib/donnees.js";

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
