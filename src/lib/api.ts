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
