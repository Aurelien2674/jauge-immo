import type { VercelRequest, VercelResponse } from "@vercel/node";
import { conclure, noterCandidat, ventesALAdresse, type DpeCandidat, type ResultatAdresse } from "../shared/adresse.js";
import type { Bien } from "../shared/types.js";
import { fetchWithTimeout, json, num } from "./_lib/http.js";
import { resoudreCommune, ventesCommune } from "./_lib/donnees.js";

const ADEME = "https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant";

/* Les noms de colonnes de la base DPE évoluent : on les lit dans le schéma publié, une fois par instance. */
let champs: Record<string, string | undefined> | null = null;
async function schema() {
  if (champs) return champs;
  const r = await fetchWithTimeout(ADEME, {}, 8000);
  const d = await r.json();
  const keys: string[] = (d.schema ?? []).map((f: any) => f.key);
  const find = (...res: RegExp[]) => { for (const re of res) { const k = keys.find((x) => re.test(x)); if (k) return k; } return undefined; };
  champs = {
    numero: find(/^numero_dpe$/),
    date: find(/^date_etablissement_dpe$/),
    etiquette: find(/^etiquette_dpe$/),
    etiquetteGes: find(/^etiquette_ges$/),
    conso: find(/^conso_5_usages_par_m2_ep$/, /^conso_5_usages.*m2.*_ep$/, /conso.*5.*usages.*m2.*(ep|primaire)/),
    ges: find(/^emission_ges_5_usages_par_m2$/, /^emission_ges_5_usages.*m2$/, /emission.*ges.*5.*usages.*m2/),
    surface: find(/^surface_habitable_logement$/, /^surface_habitable/),
    annee: find(/^annee_construction$/),
    type: find(/^type_batiment$/),
    adresse: find(/^adresse_ban$/, /^adresse_brut$/),
    complement: find(/^complement_adresse_logement$/),
    etage: find(/^numero_etage_appartement$/),
    cp: find(/^code_postal_ban$/),
    geo: find(/^_geopoint$/),
  };
  return champs;
}

async function geocoder(adresse: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const r = await fetchWithTimeout(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresse)}&limit=1`, {}, 5000);
    const d = await r.json();
    const c = d.features?.[0]?.geometry?.coordinates;
    return c ? { lon: c[0], lat: c[1] } : null;
  } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = req.query;
  const b: Bien = {
    type: q.type === "maison" ? "maison" : "appartement", etat: "ancien", prix: 0,
    surface: num(q.surface) ?? 0, dpe: (typeof q.dpe === "string" && /^[A-G]$/.test(q.dpe) ? q.dpe : undefined) as Bien["dpe"],
    ges: (typeof q.ges === "string" && /^[A-G]$/.test(q.ges) ? q.ges : undefined) as Bien["ges"],
    consoEP: num(q.conso), gesM2: num(q.gesm2), annee: num(q.annee),
  };
  const cpIn = typeof q.cp === "string" ? q.cp.trim() : undefined;
  if (!b.surface || (!b.dpe && !b.consoEP)) {
    const r: ResultatAdresse = { statut: "insuffisant", confiance: null, message: "Il faut au moins la surface et la classe DPE (idéalement la consommation et les émissions exactes) pour retrouver l'adresse.", candidats: [], ventesAdresse: [] };
    return json(res, 200, r);
  }

  try {
    const commune = await resoudreCommune({ cp: cpIn, ville: typeof q.ville === "string" ? q.ville : undefined, lat: num(q.lat), lon: num(q.lon) });
    const cp = cpIn?.length === 5 ? cpIn : commune?.codesPostaux?.[0];
    if (!cp) return json(res, 200, { statut: "insuffisant", confiance: null, message: "Code postal du bien requis.", candidats: [], ventesAdresse: [] });

    const F = await schema();
    const select = Object.values(F).filter(Boolean).join(",");
    const p = new URLSearchParams({ size: "3000", select, sort: `-${F.date ?? "date_etablissement_dpe"}` });
    p.set(`${F.cp ?? "code_postal_ban"}_in`, cp);
    if (b.dpe && F.etiquette) p.set(`${F.etiquette}_in`, b.dpe);
    if (F.surface) { p.set(`${F.surface}_gte`, String(Math.floor(b.surface * 0.94 - 1))); p.set(`${F.surface}_lte`, String(Math.ceil(b.surface * 1.06 + 1))); }
    const appel = () => fetchWithTimeout(`${ADEME}/lines?${p}`, { headers: { Accept: "application/json" } }, 15000);
    let r = await appel();
    // Repli si un filtre n'est pas accepté par l'API : sans bornes de surface, puis sans sélection de colonnes
    if (!r.ok && F.surface) { p.delete(`${F.surface}_gte`); p.delete(`${F.surface}_lte`); r = await appel(); }
    if (!r.ok) { p.delete("select"); p.set("size", "1500"); r = await appel(); }
    if (!r.ok) return json(res, 502, { erreur: "La base DPE de l'ADEME n'a pas répondu. Réessayez dans un instant." });
    const d = await r.json();

    const candidats: DpeCandidat[] = (d.results ?? []).map((x: any) => {
      const g = F.geo && typeof x[F.geo] === "string" ? String(x[F.geo]).split(",").map(Number) : null;
      const n = (k?: string) => (k && x[k] !== undefined && x[k] !== null && x[k] !== "" ? Number(x[k]) : undefined);
      return {
        numero: F.numero ? x[F.numero] : "", date: F.date ? x[F.date] : undefined,
        etiquette: F.etiquette ? x[F.etiquette] : undefined, etiquetteGes: F.etiquetteGes ? x[F.etiquetteGes] : undefined,
        conso: n(F.conso), ges: n(F.ges), surface: n(F.surface), annee: n(F.annee),
        type: F.type ? x[F.type] : undefined, adresse: F.adresse ? x[F.adresse] : undefined,
        complement: F.complement ? x[F.complement] : undefined, etage: F.etage ? x[F.etage] : undefined,
        lat: g && isFinite(g[0]) ? g[0] : undefined, lon: g && isFinite(g[1]) ? g[1] : undefined,
      };
    });
    const notes = candidats.map((c) => noterCandidat(b, c)).filter((c): c is NonNullable<typeof c> => !!c);
    // Sans valeurs exactes, une simple classe + surface donne trop de candidats pour conclure
    const utiles = !b.consoEP && !b.gesM2 && notes.length > 6 ? [] : notes;
    const base = conclure(b, utiles);
    if (!b.consoEP && !b.gesM2 && notes.length > 6) {
      base.statut = "insuffisant";
      base.message = `${notes.length} logements de la commune ont cette classe et cette surface. Ajoutez la consommation (kWh/m²/an) et les émissions (kg CO₂/m²/an) affichées dans l'annonce.`;
    }

    const top = base.candidats[0];
    if (top && (top.lat === undefined || top.lon === undefined) && top.adresse) {
      const g = await geocoder(top.adresse);
      if (g) { top.lat = g.lat; top.lon = g.lon; }
    }
    let ventesAdresse: ResultatAdresse["ventesAdresse"] = [];
    if (top && commune && base.statut === "trouvee") {
      const { ventes } = await ventesCommune(commune.code);
      ventesAdresse = ventesALAdresse(ventes, top.adresse).slice(0, 15);
    }
    return json(res, 200, { ...base, ventesAdresse } satisfies ResultatAdresse, 3600);
  } catch (e: any) {
    return json(res, 502, { erreur: "La recherche d'adresse a échoué. Réessayez dans un instant.", detail: String(e?.message ?? e) });
  }
}
