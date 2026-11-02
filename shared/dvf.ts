import type { Marche, StatsMarche, TypeBien, Vente } from "./types.js";

/** Découpe une ligne CSV (séparateur virgule, guillemets possibles). */
export function splitCsvLine(line: string, sep = ","): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Transforme un CSV geo-dvf (files.data.gouv.fr/geo-dvf) en ventes exploitables :
 * une mutation = une vente d'un seul appartement ou d'une seule maison (les dépendances sont tolérées).
 */
export function dvfCsvToVentes(csv: string): Vente[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const h = splitCsvLine(lines[0]);
  const ix = (k: string) => h.indexOf(k);
  const I = {
    id: ix("id_mutation"), date: ix("date_mutation"), nature: ix("nature_mutation"), val: ix("valeur_fonciere"),
    num: ix("adresse_numero"), voie: ix("adresse_nom_voie"), type: ix("type_local"), surf: ix("surface_reelle_bati"),
    pieces: ix("nombre_pieces_principales"), lon: ix("longitude"), lat: ix("latitude"),
  };
  if (I.id < 0 || I.val < 0 || I.type < 0) return [];

  const groups = new Map<string, string[][]>();
  for (let i = 1; i < lines.length; i++) {
    const r = splitCsvLine(lines[i]);
    const id = r[I.id];
    if (!id) continue;
    const g = groups.get(id);
    if (g) g.push(r); else groups.set(id, [r]);
  }

  const ventes: Vente[] = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    if (first[I.nature] !== "Vente") continue;
    const logements = rows.filter((r) => r[I.type] === "Appartement" || r[I.type] === "Maison");
    // une ligne par lot/parcelle : on dédoublonne les logements identiques
    const uniq = new Map<string, string[]>();
    for (const r of logements) uniq.set(`${r[I.type]}|${r[I.surf]}|${r[I.pieces]}`, r);
    if (uniq.size !== 1) continue;
    if (rows.some((r) => r[I.type] === "Local industriel. commercial ou assimilé")) continue;
    const l = [...uniq.values()][0];
    const prix = parseFloat(first[I.val]);
    const surf = parseFloat(l[I.surf]);
    if (!isFinite(prix) || !isFinite(surf) || surf < 9 || prix < 5000) continue;
    const pm2 = prix / surf;
    if (pm2 < 200 || pm2 > 40000) continue;
    const la = parseFloat(l[I.lat]), lo = parseFloat(l[I.lon]);
    ventes.push({
      d: first[I.date],
      p: Math.round(prix),
      s: Math.round(surf),
      n: l[I.pieces] ? parseInt(l[I.pieces], 10) : null,
      t: l[I.type] === "Maison" ? "M" : "A",
      la: isFinite(la) ? la : null,
      lo: isFinite(lo) ? lo : null,
      a: [l[I.num], l[I.voie]].filter(Boolean).join(" "),
    });
  }
  return ventes.sort((a, b) => (a.d < b.d ? 1 : -1));
}

export function distanceM(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Critere { type: TypeBien; surface?: number; lat?: number; lon?: number; mois?: number }

/** Sélectionne les ventes comparables et calcule les statistiques de prix au m². */
export function comparer(toutes: Vente[], c: Critere): Pick<Marche, "stats" | "parAnnee" | "ventes"> {
  const t = c.type === "maison" ? "M" : "A";
  let base = toutes.filter((v) => v.t === t);
  if (!base.length) return { stats: null, parAnnee: [], ventes: [] };

  // par année (toutes surfaces) pour la tendance
  const byYear = new Map<number, number[]>();
  for (const v of base) {
    const y = +v.d.slice(0, 4);
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(v.p / v.s);
  }
  const parAnnee = [...byYear.entries()].sort((a, b) => a[0] - b[0])
    .map(([annee, arr]) => ({ annee, mediane: Math.round(quantile(arr.sort((x, y) => x - y), 0.5)), n: arr.length }));

  // fenêtre de temps : N derniers mois par rapport à la vente la plus récente
  const last = base[0].d;
  const mois = c.mois ?? 36;
  const lim = new Date(last); lim.setMonth(lim.getMonth() - mois);
  const limS = lim.toISOString().slice(0, 10);
  base = base.filter((v) => v.d >= limS);

  // surface comparable (±35 %, élargie si trop peu de ventes)
  let cand = base;
  if (c.surface) {
    for (const tol of [0.35, 0.6]) {
      const f = base.filter((v) => Math.abs(v.s - c.surface!) / c.surface! <= tol);
      cand = f;
      if (f.length >= 8) break;
    }
    if (cand.length < 5) cand = base;
  }

  let perimetre: StatsMarche["perimetre"] = "commune";
  let rayonM: number | undefined;
  let withDist = cand.map((v) => ({ ...v, pm2: Math.round(v.p / v.s), distM: undefined as number | undefined }));
  if (c.lat && c.lon) {
    withDist = withDist.map((v) => ({ ...v, distM: v.la && v.lo ? Math.round(distanceM(c.lat!, c.lon!, v.la, v.lo)) : undefined }));
    for (const r of [300, 500, 1000, 1500]) {
      const near = withDist.filter((v) => v.distM !== undefined && v.distM <= r);
      if (near.length >= 10) { withDist = near; perimetre = "rayon"; rayonM = r; break; }
    }
  }
  if (!withDist.length) return { stats: null, parAnnee, ventes: [] };
  const pm2 = withDist.map((v) => v.pm2).sort((a, b) => a - b);
  const stats: StatsMarche = {
    n: pm2.length,
    mediane: Math.round(quantile(pm2, 0.5)),
    p25: Math.round(quantile(pm2, 0.25)),
    p75: Math.round(quantile(pm2, 0.75)),
    perimetre, rayonM,
    depuis: withDist[withDist.length - 1].d,
    jusqua: withDist[0].d,
  };
  const ventes = [...withDist]
    .sort((a, b) => (perimetre === "rayon" ? (a.distM ?? 0) - (b.distM ?? 0) : a.d < b.d ? 1 : -1))
    .slice(0, 25);
  return { stats, parAnnee, ventes };
}
