import type { ResultatAdresse } from "../../shared/adresse";
import type { Bien, Marche } from "../../shared/types";

export async function lireAnnonce(url: string): Promise<{ ok: boolean; bien?: Partial<Bien>; message?: string; erreur?: string }> {
  try {
    const r = await fetch("/api/annonce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    return await r.json();
  } catch {
    return { ok: false, message: "Le service de lecture d'annonce ne répond pas. Collez le texte de l'annonce." };
  }
}

export async function chargerMarche(b: Pick<Bien, "type" | "surface" | "pieces" | "cp" | "ville" | "lat" | "lon">): Promise<Marche> {
  const p = new URLSearchParams();
  p.set("type", b.type);
  if (b.surface) p.set("surface", String(b.surface));
  if (b.pieces) p.set("pieces", String(b.pieces));
  if (b.cp) p.set("cp", b.cp);
  if (b.ville) p.set("ville", b.ville);
  if (b.lat && b.lon) { p.set("lat", String(b.lat)); p.set("lon", String(b.lon)); }
  const r = await fetch(`/api/marche?${p}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.erreur || "Données de marché indisponibles.");
  return d;
}

export async function chercherAdresse(b: Bien): Promise<ResultatAdresse> {
  const p = new URLSearchParams({ type: b.type, surface: String(b.surface) });
  const opt: [string, unknown][] = [["cp", b.cp], ["ville", b.ville], ["dpe", b.dpe], ["ges", b.ges], ["conso", b.consoEP], ["gesm2", b.gesM2], ["annee", b.annee]];
  for (const [k, v] of opt) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const r = await fetch(`/api/adresse?${p}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.erreur || "Recherche d'adresse indisponible.");
  return d;
}
