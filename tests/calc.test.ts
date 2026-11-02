import { describe, expect, it } from "vitest";
import { capacite, capitalRestant, emoluments, fraisAcquisition, mensualite, ptz, tauxDepartemental } from "../src/lib/calc";

describe("calculs", () => {
  it("mensualité", () => {
    expect(mensualite(220000, 3.3, 25)).toBeCloseTo(1077.92, 1);
    expect(mensualite(120000, 0, 10)).toBeCloseTo(1000, 6);
  });
  it("capital restant dû s'annule à la fin", () => {
    expect(capitalRestant(200000, 3, 20, 240)).toBe(0);
    expect(capitalRestant(200000, 3, 20, 120)).toBeGreaterThan(100000);
  });
  it("émoluments du notaire 250 000 €", () => {
    expect(emoluments(250000)).toBeCloseTo(2394.75, 2);
  });
  it("droits de mutation 250 000 € à 5 %", () => {
    const f = fraisAcquisition(250000, { etat: "ancien", tauxDep: 5, debours: 0 });
    expect(f.droits).toBeCloseTo(15796.25, 1);
    const primo = fraisAcquisition(250000, { etat: "ancien", tauxDep: 5, primo: true, debours: 0 });
    expect(primo.tauxDep).toBe(4.5);
    expect(fraisAcquisition(250000, { etat: "neuf" }).droits).toBeCloseTo(1787.5, 1);
  });
  it("taux départemental selon le code postal", () => {
    expect(tauxDepartemental("26400")).toBe(4.5);
    expect(tauxDepartemental("36000")).toBe(3.8);
    expect(tauxDepartemental("69001")).toBe(5);
  });
  it("capacité d'achat cohérente", () => {
    const r = capacite({ revenus: 4000, credits: 0, apport: 0, taux: 3.3, duree: 25, assurance: 0, effortMax: 35, fraisPct: 0 });
    expect(mensualite(r.capital, 3.3, 25)).toBeCloseTo(1400, 1);
  });
  it("PTZ", () => {
    const ok = ptz({ zone: "B2", occupants: 3, type: "coll", rfr: 38000, cout: 215000, primo: true });
    expect(ok.eligible).toBe(true);
    expect(ok.tranche).toBe(2); // 32 400 < 38 000 ≤ 40 500
    expect(ok.montant).toBeCloseTo(198000 * 0.4, 0);
    expect(ptz({ zone: "A", occupants: 2, type: "ancien", rfr: 30000, cout: 200000, primo: true }).eligible).toBe(false);
  });
});
