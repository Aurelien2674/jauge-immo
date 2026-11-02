import { describe, expect, it } from "vitest";
import { conclure, noterCandidat, ventesALAdresse, type DpeCandidat } from "../shared/adresse";
import { parseAnnonceText } from "../shared/parse";
import type { Bien, Vente } from "../shared/types";

const bien: Bien = { type: "appartement", etat: "ancien", prix: 0, surface: 62, dpe: "E", ges: "C", consoEP: 287, gesM2: 31 };
const c = (o: Partial<DpeCandidat>): DpeCandidat => ({ numero: Math.random().toString(36), etiquette: "E", etiquetteGes: "C", type: "appartement", surface: 62, conso: 287, ges: 31, adresse: "12 Rue des Alpes 38000 Grenoble", ...o });

describe("adresse probable", () => {
  it("lit la consommation et les émissions dans le texte", () => {
    const b = parseAnnonceText("Consommation énergétique : 287 kWh/m²/an. Émissions de gaz à effet de serre : 31 kg CO2/m²/an. DPE : E");
    expect(b).toMatchObject({ consoEP: 287, gesM2: 31, dpe: "E" });
  });
  it("retient un DPE identique et écarte les autres", () => {
    expect(noterCandidat(bien, c({}))!.score).toBeGreaterThanOrEqual(90);
    expect(noterCandidat(bien, c({ conso: 300 }))).toBeNull();
    expect(noterCandidat(bien, c({ etiquette: "D" }))).toBeNull();
    expect(noterCandidat(bien, c({ type: "maison" }))).toBeNull();
    expect(noterCandidat(bien, c({ surface: 75 }))).toBeNull();
  });
  it("conclut avec une confiance forte quand une seule adresse correspond", () => {
    const notes = [c({}), c({ etage: 3 })].map((x) => noterCandidat(bien, x)!);
    const r = conclure(bien, notes);
    expect(r.statut).toBe("trouvee");
    expect(r.confiance).toBe("forte");
  });
  it("signale plusieurs adresses", () => {
    const notes = [c({}), c({ adresse: "5 Avenue Jean Jaurès 38000 Grenoble" })].map((x) => noterCandidat(bien, x)!);
    expect(conclure(bien, notes).statut).toBe("plusieurs");
  });
  it("retrouve les ventes DVF à la même adresse", () => {
    const v = (a: string): Vente => ({ d: "2023-01-01", p: 150000, s: 60, n: 3, t: "A", la: null, lo: null, a });
    const r = ventesALAdresse([v("12 RUE DES ALPES"), v("1 RUE DES ALPES"), v("12 AV JEAN JAURES")], "12 Rue des Alpes 38000 Grenoble");
    expect(r.map((x) => x.a)).toEqual(["12 RUE DES ALPES"]);
  });
});
