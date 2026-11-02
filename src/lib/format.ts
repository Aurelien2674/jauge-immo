export const eur = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined || !isFinite(n) ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }) + " €";
export const nf = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined || !isFinite(n) ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });
export const pct = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined || !isFinite(n) ? "—" : (n > 0 ? "+" : "") + nf(n, d) + " %";
export const arrondi = (n: number, pas: number) => Math.round(n / pas) * pas;
export const k = (v: number) => (Math.abs(v) >= 1e6 ? nf(v / 1e6, 1) + " M" : Math.abs(v) >= 1e3 ? nf(v / 1e3, 0) + " k" : nf(v, 0));
export const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
