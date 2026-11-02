import type { Bien, Marche } from "../../shared/types";
import { nf, eur, arrondi } from "./format";

export type Severite = "bad" | "warn" | "info";
export interface Point { sev: Severite; titre: string; texte: string }

/** Liste des points à vérifier avant de faire une offre. */
export function pointsAVerifier(b: Bien, m: Marche | null, f: { effort?: number | null }): Point[] {
  const P: Point[] = [];
  const add = (sev: Severite, titre: string, texte: string) => P.push({ sev, titre, texte });
  const med = m?.stats?.mediane;
  const ecart = med && b.surface ? (b.prix / b.surface / med - 1) * 100 : null;

  if (ecart !== null && ecart > 3)
    add("warn", `Prix ${nf(ecart, 0)} % au-dessus des ventes comparables`, `Au prix médian du secteur, ce bien vaudrait environ ${eur(arrondi(med! * b.surface, 1000))}. C'est une base de négociation, à nuancer selon l'étage, l'état et l'exposition.`);
  if (ecart !== null && ecart < -12)
    add("warn", "Prix nettement sous le marché", `Un écart de ${nf(ecart, 0)} % cache souvent quelque chose : gros travaux votés, servitude, viager, nuisance, état du bâti. Demandez pourquoi.`);
  if (m?.stats && m.stats.n < 8) add("info", "Peu de ventes comparables", `La comparaison repose sur ${m.stats.n} ventes : regardez aussi les biens en vente autour pour vous faire une idée.`);

  if (b.dpe === "G") add("bad", "DPE G : interdit à la location", "Depuis le 1er janvier 2025, un logement classé G ne peut plus faire l'objet d'un nouveau bail. Prévoyez la rénovation dans le budget.");
  if (b.dpe === "F") add("bad", "DPE F : interdit à la location à partir de 2028", "Les loyers sont gelés pour les classes F et G. Chiffrez les travaux pour atteindre au moins E, idéalement D.");
  if (b.dpe === "E") add("warn", "DPE E : interdit à la location à partir de 2034", "Pas bloquant aujourd'hui, mais la revente et la location se compliqueront. Regardez l'isolation et le chauffage.");
  if (!b.dpe) add("warn", "DPE non renseigné", "Le DPE est obligatoire dans l'annonce. Demandez-le : il conditionne le coût d'usage et la possibilité de louer.");
  if (b.type === "maison" && b.dpe && "EFG".includes(b.dpe))
    add("info", "Audit énergétique obligatoire", "Pour une maison classée E, F ou G, le vendeur doit fournir un audit énergétique avec des scénarios de travaux chiffrés. Demandez-le avant l'offre.");

  if (b.type === "appartement") {
    add("info", "Documents de copropriété", "Demandez les trois derniers procès-verbaux d'assemblée générale, le carnet d'entretien, le montant du fonds travaux et le plan pluriannuel de travaux.");
    if (b.charges && b.surface && b.charges / b.surface > 3.5)
      add("warn", `Charges élevées : ${nf(b.charges / b.surface, 1)} €/m²/mois`, "Au-delà de 3 €/m² par mois, vérifiez ce qui est inclus (chauffage collectif, gardien, ascenseur) et s'il y a des travaux en cours.");
    if (!b.charges) add("warn", "Charges de copropriété absentes", "Elles sont obligatoires dans une annonce de lot en copropriété. Demandez le budget prévisionnel annuel.");
    add("info", "Surface Carrez", "Vérifiez que la surface annoncée est la surface loi Carrez du diagnostic. Un écart de plus de 5 % ouvre droit à une baisse de prix.");
  }
  if (!b.taxeFonciere) add("warn", "Taxe foncière inconnue", "Elle représente souvent un à deux mois de loyer par an. Demandez le dernier avis au vendeur.");
  if (b.annee && b.annee < 1949) add("warn", "Construit avant 1949 : plomb", "Le constat de risque d'exposition au plomb est obligatoire. Regardez aussi l'électricité et les planchers.");
  if (b.annee && b.annee < 1997) add("info", "Construit avant 1997 : amiante", "Lisez le diagnostic amiante, surtout si vous prévoyez des travaux (dalles, conduits, toiture).");
  if (b.annee && b.annee >= 1950 && b.annee <= 1980) add("info", "Bâti des années 1950 à 1980", "Période de faible isolation. Vérifiez les menuiseries, l'isolation des murs et l'âge de la chaudière.");

  const e = f.effort;
  if (e && e > 35) add("bad", `Taux d'effort de ${nf(e, 0)} %`, "Au-delà de 35 % des revenus, assurance comprise, la plupart des banques refuseront le dossier. Augmentez l'apport ou allongez la durée (25 ans maximum).");
  else if (e && e > 30) add("warn", `Taux d'effort de ${nf(e, 0)} %`, "C'est proche de la limite de 35 % appliquée par les banques. Gardez une marge pour les imprévus.");

  add("info", "Risques naturels et pollution", "Consultez l'état des risques et la fiche de l'adresse sur Géorisques : inondation, retrait-gonflement des argiles, radon, sols pollués.");
  if (b.etat === "ancien") add("info", "Diagnostics électricité et gaz", "Obligatoires si les installations ont plus de 15 ans. Une installation non conforme se chiffre vite à plusieurs milliers d'euros.");

  const ordre: Record<Severite, number> = { bad: 0, warn: 1, info: 2 };
  return P.sort((a, b) => ordre[a.sev] - ordre[b.sev]);
}
