import type { Bien, Vente } from "./types.js";

/** Un DPE de la base ADEME, ramené aux champs utiles. */
export interface DpeCandidat {
  numero: string;
  date?: string;
  etiquette?: string;
  etiquetteGes?: string;
  conso?: number; // kWhEP/m²/an
  ges?: number; // kgCO2/m²/an
  surface?: number;
  annee?: number;
  type?: string; // appartement | maison | immeuble
  adresse?: string;
  complement?: string;
  etage?: string | number;
  lat?: number;
  lon?: number;
}

export interface AdresseProbable extends DpeCandidat { score: number; criteres: string[] }

export interface ResultatAdresse {
  statut: "trouvee" | "plusieurs" | "aucune" | "insuffisant";
  confiance: "forte" | "moyenne" | "faible" | null;
  message: string;
  candidats: AdresseProbable[];
  ventesAdresse: Vente[];
}

/** Note la ressemblance entre l'annonce et un DPE de la base (0 à 100). */
export function noterCandidat(b: Pick<Bien, "type" | "surface" | "dpe" | "ges" | "consoEP" | "gesM2" | "annee">, c: DpeCandidat): AdresseProbable | null {
  const criteres: string[] = [];
  let score = 0;
  if (b.dpe && c.etiquette && c.etiquette !== b.dpe) return null;
  if (b.ges && c.etiquetteGes && c.etiquetteGes !== b.ges) return null;
  if (c.type) {
    const t = c.type.toLowerCase();
    if (b.type === "maison" && !t.includes("maison")) return null;
    if (b.type === "appartement" && t.includes("maison")) return null;
  }
  if (b.surface && c.surface) {
    const d = Math.abs(b.surface - c.surface);
    if (d > Math.max(3, b.surface * 0.06)) return null;
    score += d <= 0.5 ? 25 : d <= 1.5 ? 18 : 8;
    criteres.push(d <= 0.5 ? "surface identique" : `surface à ${d.toFixed(1).replace(".", ",")} m²`);
  }
  if (b.consoEP && c.conso !== undefined) {
    const d = Math.abs(b.consoEP - c.conso);
    if (d > 3) return null;
    score += d <= 1 ? 40 : 20;
    criteres.push(d <= 1 ? "consommation identique" : "consommation très proche");
  }
  if (b.gesM2 && c.ges !== undefined) {
    const d = Math.abs(b.gesM2 - c.ges);
    if (d > 2) return null;
    score += d <= 1 ? 25 : 10;
    criteres.push(d <= 1 ? "émissions identiques" : "émissions très proches");
  }
  if (b.annee && c.annee) {
    if (Math.abs(b.annee - c.annee) <= 1) { score += 5; criteres.push("année de construction"); }
  }
  if (b.dpe && c.etiquette === b.dpe) { score += 5; criteres.push(`classe ${b.dpe}`); }
  return { ...c, score: Math.min(100, score), criteres };
}

const normAdr = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\b(\d{5})\b.*$/, "").replace(/[^A-Z0-9]+/g, " ").trim();

/** Regroupe les candidats et décide du niveau de confiance. */
export function conclure(b: Pick<Bien, "consoEP" | "gesM2">, notes: AdresseProbable[]): Omit<ResultatAdresse, "ventesAdresse"> {
  if (!b.consoEP && !b.gesM2 && !notes.length)
    return { statut: "insuffisant", confiance: null, message: "Ajoutez la consommation (kWh/m²/an) et les émissions (kg CO₂/m²/an) affichées dans l'annonce pour retrouver l'adresse.", candidats: [] };
  const tri = notes.sort((a, z) => z.score - a.score || (z.date ?? "").localeCompare(a.date ?? ""));
  if (!tri.length) return { statut: "aucune", confiance: null, message: "Aucun DPE de la base ADEME ne correspond. Le diagnostic est peut-être antérieur à juillet 2021, ou les valeurs de l'annonce sont arrondies.", candidats: [] };

  const top = tri[0].score;
  const proches = tri.filter((c) => c.score >= top - 5);
  const adresses = new Set(proches.map((c) => normAdr(c.adresse ?? "")));
  const precis = !!(b.consoEP && b.gesM2);
  if (adresses.size === 1) {
    const confiance = precis && top >= 80 ? "forte" : top >= 55 ? "moyenne" : "faible";
    const memeImmeuble = proches.length > 1;
    return {
      statut: "trouvee", confiance,
      message: memeImmeuble ? `Adresse retrouvée. ${proches.length} logements de cet immeuble ont un DPE identique : l'étage ou le lot n'est pas certain.` : "Un seul DPE correspond à l'annonce.",
      candidats: tri.slice(0, 6),
    };
  }
  return {
    statut: "plusieurs", confiance: adresses.size <= 3 && precis ? "moyenne" : "faible",
    message: `${adresses.size} adresses possibles. Ajoutez les valeurs exactes du DPE (consommation et émissions) pour départager.`,
    candidats: tri.slice(0, 6),
  };
}

/** Ventes DVF enregistrées à la même adresse (même numéro et même voie). */
export function ventesALAdresse(ventes: Vente[], adresseBan?: string): Vente[] {
  if (!adresseBan) return [];
  const cible = normAdr(adresseBan);
  const num = cible.match(/^(\d+)\s/)?.[1];
  if (!num) return [];
  return ventes.filter((v) => {
    const a = normAdr(v.a || "");
    const m = a.match(/^(\d+)\s+(.*)$/);
    if (!m || m[1] !== num) return false;
    const motCle = m[2].split(" ").filter((w) => w.length > 3).sort((x, y) => y.length - x.length)[0];
    return !!motCle && cible.includes(motCle);
  });
}
