import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SIMULATEURS } from "../../App";
import { LineChart, NumField, SelectField } from "../../components/ui";
import { acheterOuLouer, amortissementAnnuel, capacite, fraisAcquisition, mensualite, ptz, PTZ, rentabilite, type TypePtz, type ZonePtz } from "../../lib/calc";
import { arrondi, eur, nf } from "../../lib/format";

function useNums<T extends Record<string, number | undefined>>(init: T) {
  const [v, setV] = useState(init);
  const n = (k: keyof T) => (v[k] ?? 0) as number;
  const field = (k: keyof T, label: string, unit?: string) => (
    <NumField label={label} unit={unit} value={v[k] as number | undefined} onChange={(x) => setV((s) => ({ ...s, [k]: x }))} />
  );
  return { n, field };
}

function Page({ titre, lede, form, children }: { titre: ReactNode; lede: string; form: ReactNode; children: ReactNode }) {
  return (
    <>
      <h1>{titre}</h1>
      <p className="lede">{lede}</p>
      <div className="grid"><div className="panel form">{form}</div><div className="panel">{children}</div></div>
    </>
  );
}

export function SimIndex() {
  return (
    <>
      <h1>Simulateurs</h1>
      <div className="sim-list">{SIMULATEURS.map((s) => <Link key={s.path} className="sim-card" to={`/simulateurs/${s.path}`}><b>{s.nom}</b><span>{s.q}</span></Link>)}</div>
    </>
  );
}

/* ---------- Capacité ---------- */
export function Capacite() {
  const { n, field } = useNums({ revenus: 4200, credits: 180, apport: 30000, taux: 3.3, duree: 25, assurance: 0.3, effort: 35 });
  const [etat, setEtat] = useState<"0.078" | "0.025">("0.078");
  const r = capacite({ revenus: n("revenus"), credits: n("credits"), apport: n("apport"), taux: n("taux"), duree: Math.min(n("duree") || 25, 30), assurance: n("assurance"), effortMax: n("effort"), fraisPct: +etat });
  return (
    <Page titre={<>Quel budget <em>pouvez-vous envisager ?</em></>} lede="Les banques limitent l'effort à 35 % des revenus, assurance comprise, sur 25 ans maximum (règle du HCSF). Le budget se déduit de vos revenus, de votre apport et du taux."
      form={<>
        {field("revenus", "Revenus nets mensuels du foyer", "€")}
        {field("credits", "Crédits en cours", "€/mois")}
        {field("apport", "Apport personnel", "€")}
        <div className="row3">{field("taux", "Taux", "%")}{field("duree", "Durée", "ans")}{field("assurance", "Assurance", "%")}</div>
        <div className="row2">{field("effort", "Taux d'effort max", "%")}
          <SelectField label="Bien visé" value={etat} onChange={setEtat} options={[["0.078", "Ancien (≈ 7,8 % de frais)"], ["0.025", "Neuf (≈ 2,5 % de frais)"]]} /></div>
      </>}>
      <div className="eyebrow">Prix du bien envisageable</div>
      <div className="big">{eur(arrondi(r.prixBien, 1000))}</div>
      <div className="big-label">pour un budget total de {eur(arrondi(r.budget, 1000))}, frais inclus</div>
      <dl className="kv">
        <dt>Mensualité maximale (assurance comprise)</dt><dd>{eur(r.mensMax)}</dd>
        <dt>Capital empruntable</dt><dd>{eur(r.capital)}</dd>
        <dt>Apport</dt><dd>{eur(n("apport"))}</dd>
        <dt>Frais d'acquisition estimés</dt><dd>{eur(r.frais)}</dd>
        <dt>Coût des intérêts</dt><dd>{eur(r.interets)}</dd>
      </dl>
      {n("duree") > 25 && <p className="note">La règle HCSF limite la durée à 25 ans (27 ans dans certains cas de construction ou de travaux).</p>}
      {n("apport") < r.frais && <p className="note">Votre apport ne couvre pas les frais d'acquisition. Beaucoup de banques demandent au moins ce montant.</p>}
    </Page>
  );
}

/* ---------- Mensualité ---------- */
export function Mensualite() {
  const { n, field } = useNums({ capital: 220000, taux: 3.3, duree: 25, assurance: 0.3 });
  const duree = Math.max(1, Math.min(40, Math.round(n("duree") || 1)));
  const m = mensualite(n("capital"), n("taux"), duree), am = (n("capital") * n("assurance")) / 100 / 12;
  const tab = amortissementAnnuel(n("capital"), n("taux"), duree);
  const interets = m * duree * 12 - n("capital"), assur = am * duree * 12;
  return (
    <Page titre={<>Combien coûte <em>votre prêt chaque mois ?</em></>} lede="Mensualité, coût total du crédit et évolution du capital restant dû, année par année."
      form={<>
        {field("capital", "Montant emprunté", "€")}
        <div className="row3">{field("taux", "Taux", "%")}{field("duree", "Durée", "ans")}{field("assurance", "Assurance", "%")}</div>
        <p className="hint">Assurance en % du capital initial par an (souvent entre 0,10 et 0,40 %).</p>
      </>}>
      <div className="eyebrow">Mensualité</div>
      <div className="big">{eur(m + am)}</div>
      <div className="big-label">dont {eur(m)} de crédit et {eur(am)} d'assurance</div>
      <dl className="kv">
        <dt>Coût des intérêts</dt><dd>{eur(interets)}</dd>
        <dt>Coût de l'assurance</dt><dd>{eur(assur)}</dd>
        <dt>Coût total du crédit</dt><dd>{eur(interets + assur)}</dd>
      </dl>
      <div className="section-title"><h3>Capital restant dû</h3></div>
      <LineChart series={[{ data: [n("capital"), ...tab.map((t) => t.restant)], color: "var(--accent)", area: true }]} xLabel={(i) => `an ${i}`} label="Capital restant dû" />
      <div className="section-title"><h3>Tableau d'amortissement annuel</h3></div>
      <div className="tbl-wrap"><table><thead><tr><th>Année</th><th>Intérêts</th><th>Capital remboursé</th><th>Restant dû</th></tr></thead>
        <tbody>{tab.map((r) => <tr key={r.annee}><td>{r.annee}</td><td>{eur(r.interets)}</td><td>{eur(r.capital)}</td><td>{eur(r.restant)}</td></tr>)}</tbody></table></div>
    </Page>
  );
}

/* ---------- Frais ---------- */
const DEPS: [string, string][] = [["5", "Taux de 5 % (88 départements)"], ["4.5|05", "Hautes-Alpes (05) — 4,50 %"], ["4.5|06", "Alpes-Maritimes (06) — 4,50 %"], ["4.5|07", "Ardèche (07) — 4,50 %"], ["4.5|16", "Charente (16) — 4,50 %"], ["4.5|26", "Drôme (26) — 4,50 %"], ["3.8|36", "Indre (36) — 3,80 %"], ["4.5|48", "Lozère (48) — 4,50 %"], ["4.5|60", "Oise (60) — 4,50 %"], ["4.5|65", "Hautes-Pyrénées (65) — 4,50 %"], ["4.5|71", "Saône-et-Loire (71) — 4,50 %"], ["4.5|971", "Guadeloupe (971) — 4,50 %"], ["3.8|976", "Mayotte (976) — 3,80 %"]];
export function FraisPage() {
  const { n, field } = useNums({ prix: 250000, mobilier: 0, debours: 1200 });
  const [etat, setEtat] = useState<"ancien" | "neuf">("ancien");
  const [dep, setDep] = useState("5");
  const [primo, setPrimo] = useState(false);
  const td = parseFloat(dep);
  const r = fraisAcquisition(n("prix"), { etat, tauxDep: td, primo, debours: n("debours"), mobilier: n("mobilier") });
  const tauxGlobal = r.tauxDep + 1.2 + r.tauxDep * 0.0237;
  return (
    <Page titre={<>Les frais <em>en plus du prix.</em></>} lede="Droits de mutation selon le département (barème au 1er avril 2026), émoluments réglementés du notaire, contribution de sécurité immobilière et débours."
      form={<>
        {field("prix", "Prix du bien (hors frais d'agence acquéreur)", "€")}
        {field("mobilier", "Dont mobilier déductible", "€")}
        <SelectField label="Type de bien" value={etat} onChange={setEtat} options={[["ancien", "Ancien"], ["neuf", "Neuf (VEFA, moins de 5 ans)"]]} />
        <SelectField label="Département" value={dep} onChange={setDep} options={DEPS} />
        <label className="chk"><input type="checkbox" checked={primo} onChange={(e) => setPrimo(e.target.checked)} /> Primo-accédant, résidence principale</label>
        <p className="hint">Les primo-accédants échappent à la hausse de 0,5 point votée en 2025 : le taux départemental reste à 4,50 %.</p>
        {field("debours", "Formalités et débours (estimation)", "€")}
      </>}>
      <div className="eyebrow">Frais d'acquisition</div>
      <div className="big">{eur(r.total)}</div>
      <div className="big-label">soit {nf(n("prix") ? (r.total / n("prix")) * 100 : 0, 2)} % du prix · budget total {eur(n("prix") + r.total)}</div>
      <div className="tbl-wrap" style={{ marginTop: 16 }}><table><tbody>
        <tr><td>{etat === "neuf" ? "Taxe de publicité foncière (0,715 %)" : `Droits de mutation (${nf(tauxGlobal, 2)} %)`}</td><td>{eur(r.droits)}</td></tr>
        <tr><td>Émoluments du notaire (HT)</td><td>{eur(r.emolumentsHT)}</td></tr>
        <tr><td>TVA sur émoluments (20 %)</td><td>{eur(r.tva)}</td></tr>
        <tr><td>Contribution de sécurité immobilière (0,10 %)</td><td>{eur(r.csi)}</td></tr>
        <tr><td>Formalités et débours</td><td>{eur(r.debours)}</td></tr>
        <tr className="total"><td>Total</td><td>{eur(r.total)}</td></tr>
      </tbody></table></div>
      {etat === "ancien"
        ? <p className="note">Droits = prix × (taux départemental {nf(r.tauxDep, 2)} % + taxe communale 1,20 % + frais d'assiette de 2,37 % de la part départementale).{primo && td > 4.5 ? " Taux ramené à 4,50 % pour un primo-accédant." : ""}</p>
        : <p className="note">Dans le neuf, le vendeur acquitte la TVA : l'acheteur ne paie que la taxe de publicité foncière réduite.</p>}
    </Page>
  );
}

/* ---------- Rentabilité ---------- */
export function Rentabilite() {
  const { n, field } = useNums({ prix: 150000, frais: 11700, travaux: 10000, loyer: 720, vacance: 5, chargesNR: 60, taxeFonciere: 950, pno: 150, gestion: 0, entretien: 400, apport: 20000, taux: 3.4, duree: 20 });
  const r = rentabilite({ prix: n("prix"), frais: n("frais"), travaux: n("travaux"), loyer: n("loyer"), vacance: n("vacance"), chargesNR: n("chargesNR"), taxeFonciere: n("taxeFonciere"), pno: n("pno"), gestion: n("gestion"), entretien: n("entretien"), apport: n("apport"), taux: n("taux"), duree: n("duree") || 20 });
  return (
    <Page titre={<>Que reste-t-il <em>après les charges ?</em></>} lede="Rendement brut, rendement net de charges et cash-flow mensuel avec le crédit, avant impôts."
      form={<>
        <fieldset><legend>Acquisition</legend><div className="row3">{field("prix", "Prix", "€")}{field("frais", "Frais", "€")}{field("travaux", "Travaux", "€")}</div></fieldset>
        <fieldset><legend>Revenus et charges</legend>
          <div className="row2">{field("loyer", "Loyer hors charges", "€/m")}{field("vacance", "Vacance", "%")}</div>
          <div className="row2">{field("chargesNR", "Charges non récup.", "€/m")}{field("taxeFonciere", "Taxe foncière", "€/an")}</div>
          <div className="row3">{field("pno", "Assurance PNO", "€/an")}{field("gestion", "Gestion", "%")}{field("entretien", "Entretien", "€/an")}</div>
        </fieldset>
        <fieldset><legend>Crédit</legend><div className="row3">{field("apport", "Apport", "€")}{field("taux", "Taux", "%")}{field("duree", "Durée", "ans")}</div></fieldset>
      </>}>
      <div className="tiles">
        <div className="tile"><span className="k">Brut</span><span className="v">{nf(r.brut, 2)} %</span><span className="d">loyers / coût total</span></div>
        <div className="tile"><span className="k">Net de charges</span><span className="v">{nf(r.net, 2)} %</span><span className="d">avant impôts</span></div>
        <div className="tile"><span className="k">Cash-flow</span><span className="v" style={{ color: r.cashflow >= 0 ? "var(--good)" : "var(--bad)" }}>{r.cashflow >= 0 ? "+" : ""}{eur(r.cashflow)}</span><span className="d">par mois, crédit compris</span>
          <span className={`pill ${r.cashflow >= 0 ? "good" : r.cashflow > -150 ? "warn" : "bad"}`}>{r.cashflow >= 0 ? "Autofinancé" : "Effort d'épargne"}</span></div>
      </div>
      <dl className="kv">
        <dt>Coût total de l'opération</dt><dd>{eur(r.invest)}</dd>
        <dt>Loyers encaissés (après vacance)</dt><dd>{eur(r.loyerAn)}/an</dd>
        <dt>Charges propriétaire</dt><dd>{eur(r.chargesAn)}/an</dd>
        <dt>Revenu net avant impôt</dt><dd>{eur(r.loyerAn - r.chargesAn)}/an</dd>
        <dt>Emprunt</dt><dd>{eur(r.emprunt)}</dd>
        <dt>Mensualité (assurance 0,30 %)</dt><dd>{eur(r.mens)}</dd>
      </dl>
      <p className="note">La fiscalité (micro-foncier, régime réel, LMNP) change fortement le résultat final : elle n'est pas intégrée ici.</p>
    </Page>
  );
}

/* ---------- Acheter ou louer ---------- */
export function AcheterLouer() {
  const { n, field } = useNums({ prix: 280000, apport: 45000, taux: 3.3, duree: 25, frais: 7.8, tf: 1400, entretien: 1, loyer: 1050, hp: 1.5, hl: 1.5, pl: 3, horizon: 20 });
  const hor = Math.max(1, Math.min(40, Math.round(n("horizon") || 20)));
  const r = acheterOuLouer({ prix: n("prix"), apport: n("apport"), taux: n("taux"), duree: n("duree") || 25, fraisPct: n("frais") / 100, taxeFonciere: n("tf"), entretienPct: n("entretien") / 100, loyer: n("loyer"), hausseImmo: n("hp") / 100, hausseLoyer: n("hl") / 100, placement: n("pl") / 100, horizon: hor });
  const a = r.acheteur[hor], l = r.locataire[hor];
  return (
    <Page titre={<>Acheter ou louer : <em>qui s'enrichit le plus ?</em></>} lede="On compare le patrimoine net des deux scénarios année après année. Le locataire place son apport et, chaque mois, la différence de coût s'il dépense moins que l'acheteur (et inversement)."
      form={<>
        <fieldset><legend>Achat</legend>
          <div className="row2">{field("prix", "Prix du bien", "€")}{field("apport", "Apport", "€")}</div>
          <div className="row3">{field("taux", "Taux", "%")}{field("duree", "Durée", "ans")}{field("frais", "Frais", "%")}</div>
          <div className="row2">{field("tf", "Taxe foncière", "€/an")}{field("entretien", "Entretien", "%/an")}</div>
        </fieldset>
        <fieldset><legend>Location</legend>{field("loyer", "Loyer équivalent", "€/mois")}</fieldset>
        <fieldset><legend>Hypothèses</legend>
          <div className="row3">{field("hp", "Prix immo", "%/an")}{field("hl", "Loyers", "%/an")}{field("pl", "Placement", "%/an")}</div>
          {field("horizon", "Horizon", "ans")}
        </fieldset>
      </>}>
      <div className="eyebrow">Patrimoine net dans {hor} ans</div>
      <div className="tiles two" style={{ marginTop: 8 }}>
        <div className="tile"><span className="k">Si vous achetez</span><span className="v" style={{ color: "var(--accent)" }}>{eur(arrondi(a, 1000))}</span><span className="d">bien au prix estimé, dette déduite</span></div>
        <div className="tile"><span className="k">Si vous louez</span><span className="v" style={{ color: "var(--ochre)" }}>{eur(arrondi(l, 1000))}</span><span className="d">apport et économies placés à {nf(n("pl"), 1)} %</span></div>
      </div>
      <p style={{ margin: "14px 0 4px", fontWeight: 600 }}>{a > l ? `L'achat devient plus avantageux${r.croisement ? ` à partir de la ${r.croisement}e année` : ""}.` : `Sur ${hor} ans, la location reste plus avantageuse de ${eur(arrondi(l - a, 1000))}.`}</p>
      <LineChart series={[{ data: r.acheteur, color: "var(--accent)" }, { data: r.locataire, color: "var(--ochre)" }]} xLabel={(i) => (i === 0 ? "auj." : `an ${i}`)} label="Patrimoine net acheteur et locataire" />
      <div className="legend"><span><i style={{ background: "var(--accent)" }} />Acheteur</span><span><i style={{ background: "var(--ochre)" }} />Locataire</span></div>
      <dl className="kv"><dt>Mensualité de crédit</dt><dd>{eur(r.mens)}</dd><dt>Frais d'acquisition (perdus au départ)</dt><dd>{eur(r.frais)}</dd></dl>
      <p className="note">Hypothèses simplifiées : pas de frais de revente ni de fiscalité sur le placement. La résidence principale est exonérée d'impôt sur la plus-value.</p>
    </Page>
  );
}

/* ---------- PTZ ---------- */
export function PtzPage() {
  const { n, field } = useNums({ rfr: 38000, cout: 215000 });
  const [zone, setZone] = useState<ZonePtz>("B2");
  const [occ, setOcc] = useState("3");
  const [type, setType] = useState<TypePtz>("coll");
  const [primo, setPrimo] = useState(true);
  const r = ptz({ zone, occupants: +occ, type, rfr: n("rfr"), cout: n("cout"), primo });
  return (
    <Page titre={<>Votre projet entre-t-il <em>dans le PTZ ?</em></>} lede="Prêt à taux zéro 2026 pour une première résidence principale : neuf partout en France, ancien avec au moins 25 % de travaux en zones B2 et C uniquement."
      form={<>
        <div className="row2">
          <SelectField label="Zone de la commune" value={zone} onChange={setZone} options={[["A", "A bis / A"], ["B1", "B1"], ["B2", "B2"], ["C", "C"]]} />
          <SelectField label="Occupants" value={occ} onChange={setOcc} options={["1", "2", "3", "4", "5", "6", "7", "8"].map((v) => [v, v === "8" ? "8 et +" : v])} />
        </div>
        <SelectField label="Type de projet" value={type} onChange={setType} options={[["coll", "Neuf — appartement"], ["indiv", "Neuf — maison individuelle"], ["ancien", "Ancien avec travaux (≥ 25 %)"]]} />
        {field("rfr", "Revenu fiscal de référence (avis 2025)", "€")}
        {field("cout", "Coût total de l'opération", "€")}
        <label className="chk"><input type="checkbox" checked={primo} onChange={(e) => setPrimo(e.target.checked)} /> Pas propriétaire de sa résidence principale depuis 2 ans</label>
        <p className="hint">La zone se vérifie sur le <a href="https://www.service-public.gouv.fr/simulateur/calcul/zonage-abc" target="_blank" rel="noopener noreferrer">simulateur de zonage de Service-Public</a>.</p>
      </>}>
      {!r.eligible ? (
        <><div className="eyebrow">Résultat</div><div className="big" style={{ color: "var(--bad)" }}>Non éligible</div><p>{r.motif}</p>
          <dl className="kv"><dt>Revenu retenu</dt><dd>{eur(r.revenuRetenu)}</dd><dt>Plafond de ressources</dt><dd>{eur(r.plafond)}</dd></dl>
          <p className="note">Revenu retenu = le plus élevé entre le revenu fiscal de référence et le coût de l'opération divisé par 9.</p></>
      ) : (
        <>
          <div className="eyebrow">Montant de PTZ estimé</div>
          <div className="big" style={{ color: "var(--good)" }}>{eur(arrondi(r.montant, 100))}</div>
          <div className="big-label">Tranche {r.tranche} · quotité {r.quotite} % · zone {zone}</div>
          <dl className="kv">
            <dt>Revenu retenu</dt><dd>{eur(r.revenuRetenu)}</dd>
            <dt>Plafond de ressources</dt><dd>{eur(r.plafond)}</dd>
            <dt>Coût d'opération retenu</dt><dd>{eur(r.base)}{n("cout") > r.plafondOp ? " (plafonné)" : ""}</dd>
            <dt>Durée indicative</dt><dd>{r.duree} ans</dd>
            <dt>Différé de remboursement</dt><dd>{r.differe ? `${r.differe} ans` : "aucun"}</dd>
          </dl>
          <div className="section-title"><h3>Seuils des tranches pour ce foyer</h3></div>
          <div className="tbl-wrap"><table><thead><tr><th>Tranche</th><th>Revenu jusqu'à</th><th>Quotité</th></tr></thead><tbody>
            {[0, 1, 2, 3].map((i) => <tr key={i} className={i + 1 === r.tranche ? "hl" : ""}><td>{i + 1}</td><td>{eur(i < 3 ? r.seuils[i] : r.plafond)}</td><td>{PTZ.quotites[type][i]} %</td></tr>)}
          </tbody></table></div>
          <p className="note">{type === "ancien" ? "Les travaux doivent représenter au moins 25 % du coût total de l'opération. " : ""}Durée et différé indicatifs : la banque les fixe selon votre dossier. Le PTZ ne peut pas dépasser le montant du prêt principal.</p>
        </>
      )}
    </Page>
  );
}
