import type { Bien } from "../../shared/types";

export interface Financement { apport: number; taux: number; duree: number; assurance: number; revenus?: number }

export const FIN_DEFAUT: Financement = { apport: 25000, taux: 3.3, duree: 25, assurance: 0.3 };
export const BIEN_VIDE: Bien = { type: "appartement", etat: "ancien", prix: 0, surface: 0 };
export const BIEN_EXEMPLE: Bien = {
  type: "appartement", etat: "ancien", prix: 189000, surface: 58, pieces: 3, dpe: "E", annee: 1972, charges: 165,
  cp: "38000", ville: "Grenoble", titre: "Exemple — appartement T3 de 58 m²", source: "exemple",
};

const KEY = "jauge-brouillon";
export function lireBrouillon(): { bien: Bien; fin: Financement } | null {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function ecrireBrouillon(bien: Bien, fin: Financement) {
  try { localStorage.setItem(KEY, JSON.stringify({ bien, fin })); } catch { /* stockage indisponible */ }
}
export function finSauvee(): Financement {
  return lireBrouillon()?.fin ?? FIN_DEFAUT;
}
