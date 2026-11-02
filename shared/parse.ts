import type { Bien, Dpe } from "./types.js";

const DPE_RE = /^[A-G]$/;
const toNum = (s: string | number | undefined | null): number | undefined => {
  if (s === undefined || s === null) return undefined;
  if (typeof s === "number") return isFinite(s) ? s : undefined;
  const n = parseFloat(String(s).replace(/[\s  ]/g, "").replace(",", "."));
  return isFinite(n) ? n : undefined;
};
const asDpe = (s: unknown): Dpe | undefined => {
  const v = String(s ?? "").trim().toUpperCase();
  return DPE_RE.test(v) ? (v as Dpe) : undefined;
};

/** Extrait les caractéristiques d'un bien depuis le texte brut d'une annonce. */
export function parseAnnonceText(raw: string): Partial<Bien> {
  const out: Partial<Bien> = {};
  const T = raw.replace(/[  ]/g, " ");

  const prices = [...T.matchAll(/(\d{1,3}(?:[ .]\d{3})+|\d{5,8})\s*(?:€|euros?\b)/gi)]
    .map((m) => parseInt(m[1].replace(/[ .]/g, ""), 10))
    .filter((n) => n >= 15000 && n <= 30000000);
  if (prices.length) out.prix = Math.max(...prices);

  const s = T.match(/(\d{1,4}(?:[,.]\d{1,2})?)\s*m(?:²|2)(?![\w])/i);
  if (s) out.surface = toNum(s[1]);

  const p = T.match(/(\d{1,2})\s*pi[eè]ces?/i) || T.match(/\b[TF](\d)\b/);
  if (p) out.pieces = parseInt(p[1], 10);

  const d = T.match(/(?:DPE|classe\s+[ée]nergie|consommation\s+[ée]nerg[ée]tique|performance\s+[ée]nerg[ée]tique)[^A-Ga-g\n]{0,25}\b([A-G])\b/i);
  if (d) out.dpe = asDpe(d[1]);
  const g = T.match(/(?:GES|gaz\s+[àa]\s+effet\s+de\s+serre|classe\s+climat)[^A-Ga-g\n]{0,25}\b([A-G])\b/i);
  if (g) out.ges = asDpe(g[1]);
  const kwh = T.match(/(\d{1,4}(?:[,.]\d+)?)\s*kWh\s*(?:EP|ep|d'énergie primaire)?\s*\/\s*m(?:²|2)\s*(?:\/|par)\s*an/i);
  if (kwh) out.consoEP = toNum(kwh[1]);
  const co2 = T.match(/(\d{1,3}(?:[,.]\d+)?)\s*kg\s*(?:éq\.?|eq\.?)?\s*CO\s*2(?:\s*eq)?\s*\/\s*m(?:²|2)\s*(?:\/|par)\s*an/i);
  if (co2) out.gesM2 = toNum(co2[1]);

  const c =
    T.match(/charges?(?:\s+de\s+copropri[ée]t[ée])?[^\d€\n]{0,40}(\d[\d ]{0,6})\s*€?\s*(?:\/\s*mois|par\s+mois|mensuel)/i) ||
    T.match(/charges?[^\d€\n]{0,30}(\d[\d ]{0,6})\s*€/i);
  if (c) {
    let v = parseInt(c[1].replace(/ /g, ""), 10);
    const tail = T.slice(c.index ?? 0, (c.index ?? 0) + c[0].length + 15);
    if (/\/\s*an\b|par\s+an|annuel/i.test(tail) && v > 600) v = Math.round(v / 12);
    if (v > 0 && v < 5000) out.charges = v;
  }

  const tf = T.match(/taxe\s+fonci[eè]re[^\d\n]{0,25}(\d[\d ]{1,6})\s*€/i);
  if (tf) out.taxeFonciere = parseInt(tf[1].replace(/ /g, ""), 10);

  const vi = T.match(/(?:à|a|sur)\s+([A-ZÉÈÎ][\wÀ-ÿ'\- ]{2,40}?)\s*\(?\s*(\d{5})\)?/);
  const cp = T.match(/\b((?:0[1-9]|[1-8]\d|9[0-5])\d{3}|97[1-6]\d{2})\b/);
  if (vi) { out.ville = vi[1].trim(); out.cp = vi[2]; }
  else if (cp) out.cp = cp[1];

  const an = T.match(/(?:construit|construction|bâti|bati|ann[ée]e\s+de\s+construction)[^\d\n]{0,20}((?:18|19|20)\d\d)/i);
  if (an) out.annee = parseInt(an[1], 10);

  const head = T.slice(0, 400);
  if (/\b(maison|villa|pavillon|longère|corps de ferme)\b/i.test(head)) out.type = "maison";
  else if (/appartement|studio|\bT\d\b|duplex|loft/i.test(T)) out.type = "appartement";
  if (/\b(neuf|VEFA|livraison prévue)\b/i.test(T) && !/\bétat neuf\b|\bcomme neuf\b|\brefait à neuf\b/i.test(T)) out.etat = "neuf";
  return out;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

function meta(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re) || html.match(re2);
  return m ? decode(m[1]) : undefined;
}

/** Données Leboncoin contenues dans __NEXT_DATA__ */
function fromLeboncoin(html: string): Partial<Bien> | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]);
    const ad = data?.props?.pageProps?.ad;
    if (!ad) return null;
    const attr = (k: string) => ad.attributes?.find((a: any) => a.key === k)?.value;
    const out: Partial<Bien> = {
      titre: ad.subject,
      prix: toNum(Array.isArray(ad.price) ? ad.price[0] : ad.price),
      surface: toNum(attr("square")),
      pieces: toNum(attr("rooms")),
      dpe: asDpe(attr("energy_rate")),
      ges: asDpe(attr("ges")),
      cp: ad.location?.zipcode,
      ville: ad.location?.city_label?.replace(/\s*\d{5}$/, "") || ad.location?.city,
      lat: toNum(ad.location?.lat),
      lon: toNum(ad.location?.lng),
      photo: ad.images?.urls_large?.[0] || ad.images?.urls?.[0],
      source: "Leboncoin",
    };
    const ret = attr("real_estate_type");
    if (ret === "1") out.type = "maison";
    else if (ret === "2") out.type = "appartement";
    const charges = toNum(attr("monthly_charges") ?? attr("charges"));
    if (charges) out.charges = charges;
    const fromBody = parseAnnonceText(`${ad.subject ?? ""}\n${ad.body ?? ""}`);
    return { ...fromBody, ...clean(out) };
  } catch {
    return null;
  }
}

/** Bien'ici expose une API JSON publique par annonce */
export function bieniciIdFromUrl(url: string): string | null {
  const m = url.match(/bienici\.com\/annonce\/[^?#]*\/([^/?#]+)(?:[?#]|$)/);
  return m ? m[1] : null;
}
export function fromBieniciJson(ad: any): Partial<Bien> {
  const out: Partial<Bien> = {
    titre: ad.title,
    prix: toNum(ad.price),
    surface: toNum(ad.surfaceArea),
    pieces: toNum(ad.roomsQuantity),
    dpe: asDpe(ad.energyClassification),
    ges: asDpe(ad.greenhouseGazClassification),
    annee: toNum(ad.yearOfConstruction),
    consoEP: toNum(ad.energyValue),
    gesM2: toNum(ad.greenhouseGazValue),
    cp: ad.postalCode,
    ville: ad.city,
    lat: toNum(ad.blurInfo?.position?.lat ?? ad.blurInfo?.centroid?.lat),
    lon: toNum(ad.blurInfo?.position?.lon ?? ad.blurInfo?.centroid?.lon),
    photo: ad.photos?.[0]?.url,
    type: ad.propertyType === "house" ? "maison" : ad.propertyType === "flat" ? "appartement" : undefined,
    etat: ad.newProperty ? "neuf" : "ancien",
    source: "Bien'ici",
  };
  const fees = toNum(ad.annualCondominiumFees);
  if (fees) out.charges = Math.round(fees / 12);
  const fromBody = parseAnnonceText(`${ad.title ?? ""}\n${ad.description ?? ""}`);
  return { ...fromBody, ...clean(out) };
}

function walkJsonLd(node: any, acc: Partial<Bien>) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((n) => walkJsonLd(n, acc));
  const offer = node.offers ? (Array.isArray(node.offers) ? node.offers[0] : node.offers) : null;
  if (offer?.price && !acc.prix) acc.prix = toNum(offer.price);
  if (node.floorSize?.value && !acc.surface) acc.surface = toNum(node.floorSize.value);
  if (node.numberOfRooms && !acc.pieces) acc.pieces = toNum(node.numberOfRooms);
  if (node.address?.postalCode && !acc.cp) acc.cp = String(node.address.postalCode);
  if (node.address?.addressLocality && !acc.ville) acc.ville = node.address.addressLocality;
  if (node.geo?.latitude && !acc.lat) { acc.lat = toNum(node.geo.latitude); acc.lon = toNum(node.geo.longitude); }
  if (node.name && !acc.titre) acc.titre = node.name;
  for (const k of Object.keys(node)) if (typeof node[k] === "object") walkJsonLd(node[k], acc);
}

function clean<T extends object>(o: T): Partial<T> {
  const r: any = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "" && !(typeof v === "number" && !isFinite(v))) r[k] = v;
  return r;
}

export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(br|p|div|li|h\d)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  ).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/** Extraction générique depuis le HTML d'une page d'annonce. */
export function extractFromHtml(html: string, url: string): Partial<Bien> {
  if (/leboncoin\.fr/.test(url)) {
    const lbc = fromLeboncoin(html);
    if (lbc && lbc.prix) return { ...lbc, url };
  }
  const ld: Partial<Bien> = {};
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walkJsonLd(JSON.parse(m[1]), ld); } catch { /* ignore */ }
  }
  const title = meta(html, "og:title") || html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const desc = meta(html, "og:description") || meta(html, "description");
  const text = `${title ?? ""}\n${desc ?? ""}\n${htmlToText(html).slice(0, 20000)}`;
  const fromText = parseAnnonceText(text);
  const host = new URL(url).hostname.replace(/^www\./, "");
  return {
    ...fromText,
    ...clean(ld),
    titre: ld.titre || (title ? decode(title).trim() : undefined),
    photo: meta(html, "og:image"),
    url,
    source: host,
  };
}
