export type TypeBien = "appartement" | "maison";
export type Dpe = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export interface Bien {
  type: TypeBien;
  etat: "ancien" | "neuf";
  prix: number;
  surface: number;
  pieces?: number;
  dpe?: Dpe;
  ges?: Dpe;
  annee?: number;
  charges?: number; // €/mois
  taxeFonciere?: number; // €/an
  cp?: string;
  ville?: string;
  lat?: number;
  lon?: number;
  titre?: string;
  url?: string;
  photo?: string;
  source?: string;
}

export interface Vente {
  d: string; // date AAAA-MM-JJ
  p: number; // prix
  s: number; // surface bâtie
  n: number | null; // pièces
  t: "A" | "M"; // Appartement / Maison
  la: number | null;
  lo: number | null;
  a: string; // adresse
}

export interface StatsMarche {
  n: number;
  mediane: number;
  p25: number;
  p75: number;
  perimetre: "rayon" | "commune";
  rayonM?: number;
  depuis: string;
  jusqua: string;
}

export interface Marche {
  commune: { insee: string; nom: string; cp?: string; lat?: number; lon?: number };
  stats: StatsMarche | null;
  parAnnee: { annee: number; mediane: number; n: number }[];
  ventes: (Vente & { pm2: number; distM?: number })[];
  loyer: { m2: number; bas?: number; haut?: number; nbObs?: number; millesime?: number; type: string } | null;
  avertissements: string[];
}
