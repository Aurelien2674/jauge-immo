/* Calculs financiers — fonctions pures, testées dans tests/calc.test.ts */

export function mensualite(capital: number, tauxAn: number, ans: number): number {
  const n = ans * 12, r = tauxAn / 100 / 12;
  if (n <= 0 || capital <= 0) return 0;
  return r === 0 ? capital / n : (capital * r) / (1 - Math.pow(1 + r, -n));
}

export function capitalRestant(capital: number, tauxAn: number, ans: number, mois: number): number {
  const r = tauxAn / 100 / 12, m = mensualite(capital, tauxAn, ans);
  if (mois >= ans * 12) return 0;
  if (r === 0) return Math.max(0, capital - m * mois);
  return Math.max(0, capital * Math.pow(1 + r, mois) - (m * (Math.pow(1 + r, mois) - 1)) / r);
}

export function amortissementAnnuel(capital: number, tauxAn: number, ans: number) {
  const m = mensualite(capital, tauxAn, ans);
  return Array.from({ length: ans }, (_, i) => {
    const debut = capitalRestant(capital, tauxAn, ans, i * 12), fin = capitalRestant(capital, tauxAn, ans, (i + 1) * 12);
    return { annee: i + 1, interets: m * 12 - (debut - fin), capital: debut - fin, restant: fin };
  });
}

/* ---------- Frais de notaire (barème 2026) ---------- */
export const TRANCHES_EMOLUMENTS: [number, number][] = [[6500, 3.87], [17000, 1.596], [60000, 1.064], [Infinity, 0.799]];

export function emoluments(prix: number): number {
  let prev = 0, t = 0;
  for (const [lim, r] of TRANCHES_EMOLUMENTS) {
    if (prix > prev) t += ((Math.min(prix, lim) - prev) * r) / 100;
    prev = lim;
  }
  return t;
}

/** Départements dont le taux départemental de DMTO est inférieur à 5 % au 1er avril 2026 */
export const DEPARTEMENTS_TAUX_REDUIT: Record<string, number> = {
  "05": 4.5, "06": 4.5, "07": 4.5, "16": 4.5, "26": 4.5, "36": 3.8, "48": 4.5, "60": 4.5, "65": 4.5, "71": 4.5, "971": 4.5, "976": 3.8,
};
export function tauxDepartemental(cpOuInsee?: string): number {
  if (!cpOuInsee) return 5;
  const d = cpOuInsee.startsWith("97") ? cpOuInsee.slice(0, 3) : cpOuInsee.slice(0, 2);
  return DEPARTEMENTS_TAUX_REDUIT[d] ?? 5;
}

export interface Frais { tauxDep: number; droits: number; emolumentsHT: number; tva: number; csi: number; debours: number; total: number }

export function fraisAcquisition(prix: number, opt: { etat: "ancien" | "neuf"; tauxDep?: number; primo?: boolean; debours?: number; mobilier?: number }): Frais {
  const base = Math.max(0, prix - (opt.mobilier ?? 0));
  let td = opt.tauxDep ?? 5;
  if (opt.etat === "ancien" && opt.primo && td > 4.5) td = 4.5;
  const droits = opt.etat === "neuf" ? base * 0.00715 : base * (td / 100 + 0.012 + (td / 100) * 0.0237);
  const emolumentsHT = emoluments(base), tva = emolumentsHT * 0.2, csi = Math.max(15, base * 0.001);
  const debours = opt.debours ?? 1200;
  return { tauxDep: td, droits, emolumentsHT, tva, csi, debours, total: droits + emolumentsHT + tva + csi + debours };
}

/* ---------- Capacité d'achat (règle HCSF) ---------- */
export function capacite(o: { revenus: number; credits: number; apport: number; taux: number; duree: number; assurance: number; effortMax: number; fraisPct: number }) {
  const mensMax = Math.max(0, (o.revenus * o.effortMax) / 100 - o.credits);
  const unitaire = mensualite(1, o.taux, o.duree) + o.assurance / 100 / 12;
  const capital = unitaire > 0 ? mensMax / unitaire : 0;
  const budget = capital + o.apport;
  const prixBien = budget / (1 + o.fraisPct);
  return { mensMax, capital, budget, prixBien, frais: budget - prixBien, interets: mensualite(capital, o.taux, o.duree) * o.duree * 12 - capital };
}

/* ---------- Rentabilité locative ---------- */
export function rentabilite(o: { prix: number; frais: number; travaux: number; loyer: number; vacance: number; chargesNR: number; taxeFonciere: number; pno: number; gestion: number; entretien: number; apport: number; taux: number; duree: number }) {
  const invest = o.prix + o.frais + o.travaux;
  const loyerAn = o.loyer * 12 * (1 - o.vacance / 100);
  const chargesAn = o.chargesNR * 12 + o.taxeFonciere + o.pno + o.entretien + (loyerAn * o.gestion) / 100;
  const emprunt = Math.max(0, invest - o.apport);
  const mens = mensualite(emprunt, o.taux, o.duree) + (emprunt * 0.003) / 12;
  return {
    invest, loyerAn, chargesAn, emprunt, mens,
    brut: invest ? ((o.loyer * 12) / invest) * 100 : 0,
    net: invest ? ((loyerAn - chargesAn) / invest) * 100 : 0,
    cashflow: (loyerAn - chargesAn) / 12 - mens,
  };
}

/* ---------- Acheter ou louer ---------- */
export function acheterOuLouer(o: { prix: number; apport: number; taux: number; duree: number; fraisPct: number; taxeFonciere: number; entretienPct: number; loyer: number; hausseImmo: number; hausseLoyer: number; placement: number; horizon: number }) {
  const frais = o.prix * o.fraisPct;
  const emprunt = Math.max(0, o.prix + frais - o.apport);
  const mens = mensualite(emprunt, o.taux, o.duree) + (emprunt * 0.003) / 12;
  const rm = Math.pow(1 + o.placement, 1 / 12) - 1;
  let pfA = 0, pfL = o.apport, loyer = o.loyer, croisement: number | null = null;
  const acheteur = [o.prix - emprunt], locataire = [o.apport];
  for (let y = 1; y <= o.horizon; y++) {
    for (let m = 1; m <= 12; m++) {
      const mo = (y - 1) * 12 + m;
      const valeur = o.prix * Math.pow(1 + o.hausseImmo, (mo - 1) / 12);
      const coutA = (mo <= o.duree * 12 ? mens : 0) + (o.taxeFonciere / 12) * Math.pow(1 + o.hausseImmo, (mo - 1) / 12) + (valeur * o.entretienPct) / 12;
      pfA *= 1 + rm; pfL *= 1 + rm;
      if (coutA > loyer) pfL += coutA - loyer; else pfA += loyer - coutA;
    }
    loyer *= 1 + o.hausseLoyer;
    const wa = o.prix * Math.pow(1 + o.hausseImmo, y) - capitalRestant(emprunt, o.taux, o.duree, y * 12) + pfA;
    acheteur.push(wa); locataire.push(pfL);
    if (croisement === null && wa > pfL) croisement = y;
  }
  return { frais, emprunt, mens, acheteur, locataire, croisement };
}

/* ---------- PTZ 2026 ---------- */
export type ZonePtz = "A" | "B1" | "B2" | "C";
export type TypePtz = "coll" | "indiv" | "ancien";
export const PTZ = {
  plafondRessources: { A: 49000, B1: 34500, B2: 31500, C: 28500 } as Record<ZonePtz, number>,
  tranches: { A: [25000, 31000, 37000], B1: [21500, 26000, 30000], B2: [18000, 22500, 27000], C: [15000, 19500, 24000] } as Record<ZonePtz, number[]>,
  plafondOperation: { A: 150000, B1: 135000, B2: 110000, C: 100000 } as Record<ZonePtz, number>,
  coefficients: [0, 1, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0, 3.3],
  quotites: { coll: [50, 40, 40, 20], indiv: [30, 20, 20, 10], ancien: [50, 40, 40, 20] } as Record<TypePtz, number[]>,
  durees: [[25, 15], [22, 10], [20, 5], [10, 0]],
};

export function ptz(o: { zone: ZonePtz; occupants: number; type: TypePtz; rfr: number; cout: number; primo: boolean }) {
  const c = PTZ.coefficients[Math.min(8, Math.max(1, o.occupants))];
  const revenuRetenu = Math.max(o.rfr, o.cout / 9);
  const plafond = PTZ.plafondRessources[o.zone] * c;
  let motif: string | null = null;
  if (!o.primo) motif = "Le PTZ est réservé aux personnes qui n'ont pas été propriétaires de leur résidence principale au cours des deux dernières années.";
  else if (o.type === "ancien" && (o.zone === "A" || o.zone === "B1")) motif = "Dans l'ancien, le PTZ n'est ouvert qu'en zones B2 et C.";
  else if (revenuRetenu > plafond) motif = `Le revenu retenu dépasse le plafond de ressources pour ce foyer et cette zone.`;
  const seuils = PTZ.tranches[o.zone].map((s) => s * c);
  const q = revenuRetenu;
  const tranche = q <= seuils[0] ? 0 : q <= seuils[1] ? 1 : q <= seuils[2] ? 2 : 3;
  const plafondOp = PTZ.plafondOperation[o.zone] * Math.min(c, 2.4);
  const base = Math.min(o.cout, plafondOp);
  const quotite = PTZ.quotites[o.type][tranche];
  const [duree, differe] = PTZ.durees[tranche];
  return { eligible: !motif, motif, revenuRetenu, plafond, seuils, tranche: tranche + 1, plafondOp, base, quotite, montant: motif ? 0 : (base * quotite) / 100, duree, differe };
}

/* ---------- Énergie ---------- */
export const DPE_EP: Record<string, number> = { A: 50, B: 90, C: 145, D: 215, E: 290, F: 375, G: 450 };
export const DPE_COULEUR: Record<string, string> = { A: "#2f9e44", B: "#5cb85c", C: "#a3c93a", D: "#f2d024", E: "#f0a92b", F: "#e66b2c", G: "#d0312d" };
export const PRIX_KWH_EP = 0.1;
export function energieAnnuelle(dpe: string | undefined, surface: number): number | null {
  return dpe && DPE_EP[dpe] ? DPE_EP[dpe] * surface * PRIX_KWH_EP : null;
}
