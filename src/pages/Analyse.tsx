import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Bien, Dpe, Marche } from "../../shared/types";
import { chargerMarche } from "../lib/api";
import { energieAnnuelle, fraisAcquisition, mensualite, tauxDepartemental } from "../lib/calc";
import { BIEN_EXEMPLE, BIEN_VIDE, FIN_DEFAUT, ecrireBrouillon, lireBrouillon, type Financement } from "../lib/draft";
import { arrondi, dateFr, eur, nf, pct } from "../lib/format";
import { pointsAVerifier } from "../lib/rules";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { Checks, DpeBar, Gauge, LineChart, NumField, SelectField } from "../components/ui";

export default function Analyse() {
  const { id } = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const { session } = useSession();
  const exemple = new URLSearchParams(loc.search).has("exemple");

  const init = useMemo(() => {
    if (exemple) return { bien: BIEN_EXEMPLE, fin: { ...FIN_DEFAUT, revenus: 3600 } };
    return lireBrouillon() ?? { bien: BIEN_VIDE, fin: FIN_DEFAUT };
  }, [exemple]);
  const [bien, setBien] = useState<Bien>(init.bien);
  const [fin, setFin] = useState<Financement>(init.fin);
  const [marche, setMarche] = useState<Marche | null>(null);
  const [etatMarche, setEtatMarche] = useState<"idle" | "load" | "ok" | "err">("idle");
  const [errMarche, setErrMarche] = useState("");
  const [loyerManuel, setLoyerManuel] = useState<number | undefined>();
  const [enregistre, setEnregistre] = useState<{ id: string; public: boolean } | null>(null);
  const [info, setInfo] = useState("");
  const [proprio, setProprio] = useState(true);

  const setB = <K extends keyof Bien>(k: K, v: Bien[K]) => setBien((b) => ({ ...b, [k]: v }));
  const setF = <K extends keyof Financement>(k: K, v: Financement[K]) => setFin((f) => ({ ...f, [k]: v }));

  // Analyse enregistrée
  useEffect(() => {
    if (!id || !supabase) return;
    supabase.from("analyses").select("*").eq("id", id).maybeSingle().then(({ data, error }) => {
      if (error || !data) { setInfo("Cette analyse est introuvable ou n'est pas partagée."); return; }
      setBien(data.bien); if (data.marche) { setMarche(data.marche); setEtatMarche("ok"); }
      setEnregistre({ id: data.id, public: data.public });
      setProprio(!!session && session.user.id === data.user_id);
    });
  }, [id, session]);

  useEffect(() => { if (!id && !exemple) ecrireBrouillon(bien, fin); }, [bien, fin, id, exemple]);

  // Données de marché (rechargées quand la localisation, le type ou la surface changent)
  const cleMarche = `${bien.type}|${bien.cp ?? ""}|${bien.ville ?? ""}|${bien.lat ?? ""}|${bien.lon ?? ""}|${Math.round((bien.surface || 0) / 5)}|${bien.pieces ?? ""}`;
  useEffect(() => {
    const locOk = bien.cp?.length === 5 || (bien.ville?.trim().length ?? 0) >= 2 || !!bien.lat;
    if (!locOk) { setEtatMarche("idle"); return; }
    if (id && marche && etatMarche === "ok") return;
    const t = setTimeout(async () => {
      setEtatMarche("load");
      try { setMarche(await chargerMarche(bien)); setEtatMarche("ok"); }
      catch (e: any) { setErrMarche(e.message); setEtatMarche("err"); }
    }, 500);
    return () => clearTimeout(t);
  }, [cleMarche]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculs
  const pm2 = bien.surface ? bien.prix / bien.surface : NaN;
  const med = marche?.stats?.mediane;
  const ecart = med && bien.surface ? (pm2 / med - 1) * 100 : null;
  const frais = fraisAcquisition(bien.prix || 0, { etat: bien.etat, tauxDep: tauxDepartemental(marche?.commune.insee ?? bien.cp) });
  const emprunt = Math.max(0, (bien.prix || 0) + frais.total - (fin.apport || 0));
  const mens = mensualite(emprunt, fin.taux || 0, fin.duree || 25) + (emprunt * (fin.assurance ?? 0.3)) / 100 / 12;
  const loyerM2 = loyerManuel ?? marche?.loyer?.m2;
  const loyer = loyerM2 ? loyerM2 * bien.surface : null;
  const rdt = loyer && bien.prix ? ((loyer * 12) / (bien.prix + frais.total)) * 100 : null;
  const energie = energieAnnuelle(bien.dpe, bien.surface || 0);
  const coutMois = mens + (bien.charges ?? 0) + (bien.taxeFonciere ?? 0) / 12 + (energie ?? 0) / 12;
  const effort = fin.revenus ? (mens / fin.revenus) * 100 : null;
  const points = pointsAVerifier(bien, marche, { effort });

  const verdict = ecart === null ? ["neutral", etatMarche === "load" ? "Recherche des ventes…" : "Localisation requise"]
    : ecart > 10 ? ["bad", "Nettement au-dessus"] : ecart > 3 ? ["warn", "Au-dessus du marché"] : ecart < -12 ? ["warn", "Très en dessous : pourquoi ?"] : ["good", "Dans le marché"];

  async function enregistrer() {
    if (!supabase) return;
    if (!session) { nav("/connexion?retour=/analyse"); return; }
    const payload = { user_id: session.user.id, titre: bien.titre || `${bien.type === "maison" ? "Maison" : "Appartement"} ${bien.surface} m² — ${marche?.commune.nom ?? bien.ville ?? ""}`, url: bien.url ?? null, bien, marche };
    const q = enregistre && proprio
      ? supabase.from("analyses").update(payload).eq("id", enregistre.id).select().single()
      : supabase.from("analyses").insert(payload).select().single();
    const { data, error } = await q;
    if (error) { setInfo("Enregistrement impossible : " + error.message); return; }
    setEnregistre({ id: data.id, public: data.public }); setProprio(true);
    setInfo("Analyse enregistrée.");
    if (!id) nav(`/r/${data.id}`, { replace: true });
  }
  async function basculerPartage() {
    if (!supabase || !enregistre) return;
    const { error } = await supabase.from("analyses").update({ public: !enregistre.public }).eq("id", enregistre.id);
    if (error) { setInfo(error.message); return; }
    const pub = !enregistre.public;
    setEnregistre({ ...enregistre, public: pub });
    if (pub) {
      const lien = `${location.origin}/r/${enregistre.id}`;
      try { await navigator.clipboard.writeText(lien); setInfo("Lien public copié : " + lien); } catch { setInfo("Lien public : " + lien); }
    } else setInfo("L'analyse n'est plus partagée.");
  }

  const placeLabel = marche?.commune.nom ? `${marche.commune.nom}${marche.commune.cp ? ` (${marche.commune.cp})` : ""}` : bien.ville || bien.cp || "localisation ?";

  return (
    <>
      <h1 style={{ fontSize: "clamp(30px,5vw,48px)" }}>{bien.titre && bien.source !== "exemple" ? bien.titre : <>Analyse <em>d'un bien</em></>}</h1>
      {info && <p className="msg" role="status">{info}</p>}
      <div className="grid">
        <div className="panel form">
          {bien.url && <p className="hint">Annonce : <a href={bien.url} target="_blank" rel="noopener noreferrer">{bien.source || "voir l'annonce"}</a></p>}
          <fieldset><legend>Le bien</legend>
            <div className="row2">
              <SelectField label="Type" value={bien.type} onChange={(v) => setB("type", v)} options={[["appartement", "Appartement"], ["maison", "Maison"]]} />
              <SelectField label="État" value={bien.etat} onChange={(v) => setB("etat", v)} options={[["ancien", "Ancien"], ["neuf", "Neuf"]]} />
            </div>
            <div className="row3">
              <NumField label="Prix" unit="€" value={bien.prix || undefined} onChange={(v) => setB("prix", v ?? 0)} />
              <NumField label="Surface" unit="m²" value={bien.surface || undefined} onChange={(v) => setB("surface", v ?? 0)} />
              <NumField label="Pièces" value={bien.pieces} onChange={(v) => setB("pieces", v)} />
            </div>
            <div className="row2">
              <label>Code postal<input inputMode="numeric" maxLength={5} value={bien.cp ?? ""} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setBien((b) => ({ ...b, cp: v || undefined, lat: undefined, lon: undefined })); }} /></label>
              <label>Ville<input value={bien.ville ?? ""} onChange={(e) => setB("ville", e.target.value || undefined)} /></label>
            </div>
            <div className="row3">
              <SelectField label="DPE" value={(bien.dpe ?? "") as Dpe | ""} onChange={(v) => setB("dpe", (v || undefined) as Dpe | undefined)} options={[["", "?"], ...("ABCDEFG".split("").map((l) => [l, l]) as [Dpe, string][])]} />
              <NumField label="Construit en" value={bien.annee} onChange={(v) => setB("annee", v)} placeholder="?" />
              <NumField label="Charges" unit="€/m" value={bien.charges} onChange={(v) => setB("charges", v)} />
            </div>
            <NumField label="Taxe foncière" unit="€/an" value={bien.taxeFonciere} onChange={(v) => setB("taxeFonciere", v)} placeholder="à demander" />
          </fieldset>
          <div className="divider" />
          <fieldset><legend>Votre financement</legend>
            <div className="row3">
              <NumField label="Apport" unit="€" value={fin.apport} onChange={(v) => setF("apport", v ?? 0)} />
              <NumField label="Taux" unit="%" value={fin.taux} onChange={(v) => setF("taux", v ?? 0)} />
              <NumField label="Durée" unit="ans" value={fin.duree} onChange={(v) => setF("duree", v ?? 25)} />
            </div>
            <div className="row2">
              <NumField label="Assurance" unit="%" value={fin.assurance} onChange={(v) => setF("assurance", v ?? 0)} />
              <NumField label="Revenus nets" unit="€/m" value={fin.revenus} onChange={(v) => setF("revenus", v)} placeholder="facultatif" />
            </div>
          </fieldset>
          <div className="divider" />
          <NumField label="Loyer de marché (remplace l'estimation)" unit="€/m²" value={loyerManuel} onChange={setLoyerManuel} placeholder={marche?.loyer ? nf(marche.loyer.m2, 1) : "à saisir"} />
          {supabase && (!id || proprio) && (
            <div className="btns">
              <button type="button" onClick={enregistrer}>{enregistre ? "Mettre à jour" : "Enregistrer l'analyse"}</button>
              {enregistre && <button type="button" className="ghost" onClick={basculerPartage}>{enregistre.public ? "Ne plus partager" : "Partager par lien"}</button>}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="report-head">
            <div>
              <div className="eyebrow">{bien.type === "maison" ? "Maison" : "Appartement"}{bien.pieces ? ` · ${bien.pieces} pièces` : ""} · {placeLabel}</div>
              <div className="price">{eur(bien.prix)}</div>
              <div className="sub">{nf(bien.surface)} m² · {isFinite(pm2) ? eur(pm2) + "/m²" : "—"}{bien.dpe ? ` · DPE ${bien.dpe}` : ""}</div>
            </div>
            {bien.photo ? <img src={bien.photo} alt="" referrerPolicy="no-referrer" /> : exemple ? <span className="pill warn">Exemple</span> : null}
          </div>

          {etatMarche === "err" && <p className="msg err">{errMarche}</p>}
          {marche?.avertissements.map((a) => <p key={a} className="msg warn" style={{ marginTop: 0 }}>{a}</p>)}

          <div className="tiles">
            <div className="tile"><span className="k">Marché</span><span className="v">{ecart !== null ? pct(ecart, 0) : etatMarche === "load" ? <div className="skeleton" style={{ width: 80, height: 26 }} /> : "—"}</span>
              <span className="d">{med ? `vs ${eur(med)}/m² · ${marche!.stats!.n} ventes` : "ventes DVF autour du bien"}</span><span className={`pill ${verdict[0]}`}>{verdict[1]}</span></div>
            <div className="tile"><span className="k">Financement</span><span className="v">{eur(mens)}<small> /mois</small></span><span className="d">{eur(emprunt)} sur {fin.duree} ans à {nf(fin.taux, 2)} %</span>
              {effort !== null && <span className={`pill ${effort > 35 ? "bad" : effort > 30 ? "warn" : "good"}`}>Effort {nf(effort, 0)} %</span>}</div>
            <div className="tile"><span className="k">Frais d'achat</span><span className="v">{eur(arrondi(frais.total, 100))}</span><span className="d">{bien.etat === "neuf" ? "neuf, frais réduits" : `ancien, taux départemental ${nf(frais.tauxDep, 2)} %`}</span></div>
            <div className="tile"><span className="k">Locatif</span><span className="v">{loyer ? eur(arrondi(loyer, 5)) : "—"}<small> /mois</small></span>
              <span className="d">{loyer ? `${nf(loyerM2!, 1)} €/m² · rendement brut ${nf(rdt!, 1)} %` : "loyer de marché inconnu"}</span>
              {marche?.loyer?.bas && !loyerManuel && <span className="d">fourchette {nf(marche.loyer.bas * bien.surface, 0)} – {nf(marche.loyer.haut! * bien.surface, 0)} €</span>}</div>
            <div className="tile"><span className="k">Énergie</span><span className="v">{energie ? eur(arrondi(energie, 10)) : "—"}<small> /an</small></span><span className="d">{bien.dpe ? "estimation selon le DPE" : "DPE inconnu"}</span>{bien.dpe && <DpeBar dpe={bien.dpe} />}</div>
            <div className="tile"><span className="k">Coût réel</span><span className="v">{eur(coutMois)}<small> /mois</small></span><span className="d">crédit, charges, taxe foncière, énergie</span></div>
          </div>

          {ecart !== null && <Gauge ecart={ecart} />}
          {marche?.stats && (
            <p className="hint">
              Médiane {eur(marche.stats.mediane)}/m², moitié des ventes entre {eur(marche.stats.p25)} et {eur(marche.stats.p75)}/m² ·{" "}
              {marche.stats.perimetre === "rayon" ? `rayon de ${nf(marche.stats.rayonM! / 1000, 1)} km` : `toute la commune`} · ventes de {dateFr(marche.stats.depuis)} à {dateFr(marche.stats.jusqua)}
            </p>
          )}

          <div className="section-title"><h3>À vérifier avant l'offre</h3><span className="count">{points.length} points</span></div>
          <Checks points={points} />

          {marche && marche.parAnnee.length > 1 && (
            <>
              <div className="section-title"><h3>Prix médian au m² à {marche.commune.nom}</h3><span className="count">{bien.type === "maison" ? "maisons" : "appartements"}</span></div>
              <LineChart series={[{ data: marche.parAnnee.map((a) => a.mediane), color: "var(--accent)", area: true }]} xLabel={(i) => String(marche.parAnnee[i].annee)} label="Évolution du prix médian au m²" />
            </>
          )}

          {marche && marche.ventes.length > 0 && (
            <>
              <div className="section-title"><h3>Ventes comparables</h3><span className="count">{marche.ventes.length} plus {marche.stats?.perimetre === "rayon" ? "proches" : "récentes"}</span></div>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Adresse</th><th>Date</th><th>Surface</th><th>Prix</th><th>€/m²</th>{marche.stats?.perimetre === "rayon" && <th>Distance</th>}</tr></thead>
                <tbody>{marche.ventes.map((v, i) => (
                  <tr key={i}><td>{v.a || "—"}</td><td>{dateFr(v.d)}</td><td>{v.s} m²</td><td>{eur(v.p)}</td><td>{eur(v.pm2)}</td>{marche.stats?.perimetre === "rayon" && <td>{v.distM !== undefined ? `${nf(v.distM)} m` : "—"}</td>}</tr>
                ))}</tbody>
              </table></div>
            </>
          )}

          <p className="note">Mensualité assurance comprise. Énergie : consommation moyenne de la classe DPE × 0,10 € par kWh d'énergie primaire. Ventes : DVF (ventes d'un seul logement, hors dépendances seules).{" "}
            <Link to="/simulateurs/frais-notaire">Détail des frais</Link> · <Link to="/simulateurs/rentabilite-locative">Rentabilité détaillée</Link></p>
        </div>
      </div>
    </>
  );
}
