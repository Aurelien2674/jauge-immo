import { describe, expect, it } from "vitest";
import { comparer, dvfCsvToVentes } from "../shared/dvf";
import { bieniciIdFromUrl, extractFromHtml, fromBieniciJson, parseAnnonceText } from "../shared/parse";

describe("lecture d'annonce", () => {
  it("texte collé", () => {
    const b = parseAnnonceText("Appartement T3 de 62 m² à Grenoble (38000). Prix : 189 000 €. Charges de copropriété : 160 € / mois. Taxe foncière : 1 050 €. DPE : E. GES : C. Construit en 1972.");
    expect(b).toMatchObject({ prix: 189000, surface: 62, pieces: 3, dpe: "E", ges: "C", charges: 160, taxeFonciere: 1050, cp: "38000", ville: "Grenoble", annee: 1972, type: "appartement" });
  });
  it("charges annuelles converties en mensuelles", () => {
    expect(parseAnnonceText("Maison 120 m2, 320000 €. Charges : 1 800 € par an").charges).toBe(150);
  });
  it("Leboncoin __NEXT_DATA__", () => {
    const ad = { subject: "Maison 5 pièces", body: "Belle maison", price: [245000], attributes: [{ key: "square", value: "110" }, { key: "rooms", value: "5" }, { key: "energy_rate", value: "d" }, { key: "real_estate_type", value: "1" }], location: { zipcode: "26400", city_label: "Crest 26400", lat: 44.73, lng: 5.02 } };
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { ad } } })}</script></html>`;
    expect(extractFromHtml(html, "https://www.leboncoin.fr/ad/ventes_immobilieres/123")).toMatchObject({ prix: 245000, surface: 110, pieces: 5, dpe: "D", type: "maison", cp: "26400", ville: "Crest", lat: 44.73 });
  });
  it("Bien'ici", () => {
    expect(bieniciIdFromUrl("https://www.bienici.com/annonce/vente/lyon-3e/appartement/3pieces/ag690000-123456?q=x")).toBe("ag690000-123456");
    expect(fromBieniciJson({ price: 300000, surfaceArea: 70, roomsQuantity: 3, energyClassification: "C", postalCode: "69003", city: "Lyon 3e", propertyType: "flat", annualCondominiumFees: 1800 })).toMatchObject({ prix: 300000, surface: 70, type: "appartement", charges: 150, dpe: "C" });
  });
  it("JSON-LD générique", () => {
    const html = `<title>Appartement</title><script type="application/ld+json">{"@type":"Product","name":"Appartement 4 pièces","offers":{"price":"265000"},"floorSize":{"value":81},"address":{"postalCode":"38000","addressLocality":"Grenoble"}}</script>`;
    expect(extractFromHtml(html, "https://www.seloger.com/annonces/1.htm")).toMatchObject({ prix: 265000, surface: 81, cp: "38000" });
  });
});

const H = "id_mutation,date_mutation,numero_disposition,nature_mutation,valeur_fonciere,adresse_numero,adresse_suffixe,adresse_nom_voie,adresse_code_voie,code_postal,code_commune,nom_commune,code_departement,ancien_code_commune,ancien_nom_commune,id_parcelle,ancien_id_parcelle,numero_volume,lot1_numero,lot1_surface_carrez,lot2_numero,lot2_surface_carrez,lot3_numero,lot3_surface_carrez,lot4_numero,lot4_surface_carrez,lot5_numero,lot5_surface_carrez,nombre_lots,code_type_local,type_local,surface_reelle_bati,nombre_pieces_principales,code_nature_culture,nature_culture,code_nature_culture_speciale,nature_culture_speciale,surface_terrain,longitude,latitude";
const row = (id: string, date: string, val: number, type: string, surf: number, pieces: number, lon = 5.72, lat = 45.18, nature = "Vente") =>
  [id, date, "1", nature, val, "12", "", "RUE TEST", "", "38000", "38185", "Grenoble", "38", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "1", "2", type, surf, pieces, "", "", "", "", "", lon, lat].join(",");

describe("DVF", () => {
  it("garde les ventes d'un seul logement", () => {
    const csv = [H,
      row("2024-1", "2024-03-01", 200000, "Appartement", 60, 3),
      row("2024-1", "2024-03-01", 200000, "Dépendance", 0, 0),
      row("2024-2", "2024-04-01", 500000, "Appartement", 50, 2), row("2024-2", "2024-04-01", 500000, "Appartement", 70, 3), // deux logements : exclue
      row("2024-3", "2024-05-01", 150000, "Appartement", 55, 3, 5.72, 45.18, "Echange"), // pas une vente
      row("2024-4", "2024-06-01", 400000, "Maison", 120, 5),
    ].join("\n");
    const v = dvfCsvToVentes(csv);
    expect(v.map((x) => x.t)).toEqual(["M", "A"]);
    expect(v[1]).toMatchObject({ p: 200000, s: 60, n: 3 });
  });
  it("statistiques comparables", () => {
    const lines = [H];
    for (let i = 0; i < 20; i++) lines.push(row(`m${i}`, `2025-0${1 + (i % 9)}-01`, 3000 * (55 + i), "Appartement", 55 + i, 3, 5.72 + i * 0.0001, 45.18));
    const ventes = dvfCsvToVentes(lines.join("\n"));
    const c = comparer(ventes, { type: "appartement", surface: 60, lat: 45.18, lon: 5.72 });
    expect(c.stats?.mediane).toBe(3000);
    expect(c.stats?.perimetre).toBe("rayon");
    expect(c.parAnnee[0]).toMatchObject({ annee: 2025, mediane: 3000 });
  });
});
