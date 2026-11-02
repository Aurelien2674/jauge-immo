import type { VercelRequest, VercelResponse } from "@vercel/node";
import { json } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";

const TYPES = ["appartement", "appartement_t12", "appartement_t3plus", "maison"];

/** Import des loyers de marché (Carte des loyers) — réservé à ADMIN_EMAIL. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return json(res, 405, { erreur: "Méthode non autorisée" });
  const sb = supabaseAdmin();
  if (!sb) return json(res, 500, { erreur: "Supabase n'est pas configuré côté serveur (SUPABASE_SERVICE_ROLE_KEY)." });

  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(token);
  const admin = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  if (!u?.user?.email || !admin || u.user.email.toLowerCase() !== admin)
    return json(res, 403, { erreur: "Import réservé à l'administrateur." });

  const { type, millesime, rows } = (req.body ?? {}) as { type: string; millesime?: number; rows: any[] };
  if (!TYPES.includes(type) || !Array.isArray(rows) || !rows.length || rows.length > 5000)
    return json(res, 400, { erreur: "Données invalides (type ou lignes)." });

  const clean = rows
    .filter((r) => typeof r.insee === "string" && /^[0-9AB]{5}$/.test(r.insee) && isFinite(+r.loyer_m2) && +r.loyer_m2 > 0)
    .map((r) => ({
      insee: r.insee, type, libelle: r.libelle ?? null, loyer_m2: +r.loyer_m2,
      bas_m2: isFinite(+r.bas_m2) ? +r.bas_m2 : null, haut_m2: isFinite(+r.haut_m2) ? +r.haut_m2 : null,
      nb_obs: Number.isInteger(+r.nb_obs) ? +r.nb_obs : null, millesime: millesime ?? null,
    }));
  const { error } = await sb.from("loyers").upsert(clean, { onConflict: "insee,type" });
  if (error) return json(res, 500, { erreur: error.message });
  return json(res, 200, { ok: true, importes: clean.length });
}
