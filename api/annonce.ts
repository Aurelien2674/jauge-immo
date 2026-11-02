import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bieniciIdFromUrl, extractFromHtml, fromBieniciJson } from "../shared/parse.js";
import { UA, fetchWithTimeout, json } from "./_lib/http.js";

// Seuls les sites d'annonces sont interrogés (protection contre les requêtes arbitraires)
const SITES = ["leboncoin.fr", "seloger.com", "bienici.com", "logic-immo.com", "pap.fr", "paruvendu.fr", "ouestfrance-immo.com", "superimmo.com", "orpi.com", "century21.fr", "laforet.com", "guy-hoquet.com", "iadfrance.fr", "safti.fr", "efficity.com", "stephaneplazaimmobilier.com", "nestenn.com", "era.fr", "green-acres.fr"];

const bloque = (html: string) =>
  html.length < 3000 && /captcha|datadome|access denied|enable javascript|robot/i.test(html);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return json(res, 405, { erreur: "Méthode non autorisée" });
  const raw = String((req.body as any)?.url ?? "").trim();
  let u: URL;
  try { u = new URL(raw); } catch { return json(res, 400, { erreur: "Ce lien n'est pas valide." }); }
  const host = u.hostname.replace(/^www\./, "");
  if (u.protocol !== "https:" || !SITES.some((s) => host === s || host.endsWith("." + s)))
    return json(res, 400, { erreur: "Ce site n'est pas pris en charge. Collez le texte de l'annonce à la place." });

  try {
    // Bien'ici publie chaque annonce en JSON
    const bid = host.endsWith("bienici.com") ? bieniciIdFromUrl(u.href) : null;
    if (bid) {
      const r = await fetchWithTimeout(`https://www.bienici.com/realEstateAd.json?id=${encodeURIComponent(bid)}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.ok) {
        const bien = { ...fromBieniciJson(await r.json()), url: u.href };
        if (bien.prix) return json(res, 200, { ok: true, bien }, 3600);
      }
    }

    const r = await fetchWithTimeout(u.href, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "fr-FR,fr;q=0.9" },
      redirect: "follow",
    });
    const html = await r.text();
    if (!r.ok || bloque(html))
      return json(res, 200, { ok: false, bloque: true, message: `${host} refuse la lecture automatique de cette page. Copiez le texte de l'annonce et collez-le ci-dessous.` });

    const bien = extractFromHtml(html, u.href);
    if (!bien.prix && !bien.surface)
      return json(res, 200, { ok: false, bloque: false, message: "Les caractéristiques n'ont pas été trouvées sur cette page. Collez le texte de l'annonce." });
    return json(res, 200, { ok: true, bien }, 3600);
  } catch {
    return json(res, 200, { ok: false, bloque: true, message: "Le site de l'annonce n'a pas répondu à temps. Collez le texte de l'annonce." });
  }
}
