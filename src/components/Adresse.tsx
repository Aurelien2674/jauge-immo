import { useEffect, useState } from "react";
import type { ResultatAdresse } from "../../shared/adresse";
import type { Bien } from "../../shared/types";
import { chercherAdresse } from "../lib/api";
import { dateFr, eur, nf } from "../lib/format";

const CONF: Record<string, [string, string]> = { forte: ["good", "Confiance forte"], moyenne: ["warn", "Confiance moyenne"], faible: ["bad", "Confiance faible"] };

/** Adresse probable du bien, retrouvée en croisant l'annonce avec la base publique des DPE (ADEME). */
export function AdresseProbable({ bien, onPosition, positionUtilisee }: { bien: Bien; onPosition: (lat: number, lon: number, adresse: string) => void; positionUtilisee: boolean }) {
  const [r, setR] = useState<ResultatAdresse | null>(null);
  const [etat, setEtat] = useState<"idle" | "load" | "err">("idle");
  const [err, setErr] = useState("");
  const pret = !!bien.surface && !!(bien.dpe || bien.consoEP) && (bien.cp?.length === 5 || (bien.ville?.length ?? 0) >= 2);
  const cle = `${bien.type}|${bien.cp}|${bien.ville}|${bien.surface}|${bien.dpe}|${bien.ges}|${bien.consoEP}|${bien.gesM2}|${bien.annee}`;

  useEffect(() => {
    if (!pret) { setR(null); setEtat("idle"); return; }
    const t = setTimeout(async () => {
      setEtat("load");
      try { setR(await chercherAdresse(bien)); setEtat("idle"); }
      catch (e: any) { setErr(e.message); setEtat("err"); }
    }, 700);
    return () => clearTimeout(t);
  }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = r?.candidats[0];
  return (
    <section>
      <div className="section-title"><h3>Adresse probable</h3><span className="count">base DPE de l'ADEME</span></div>
      {!pret && <p className="hint">Renseignez le code postal, la surface et le DPE. Avec la consommation (kWh/m²/an) et les émissions (kg CO₂/m²/an) de l'annonce, l'adresse est retrouvée dans la plupart des cas.</p>}
      {etat === "load" && <div className="skeleton" style={{ width: "60%" }} />}
      {etat === "err" && <p className="msg err">{err}</p>}
      {r && etat !== "load" && (
        <>
          {top && (r.statut === "trouvee" || r.statut === "plusieurs") ? (
            <div className="tile" style={{ gap: 6 }}>
              <span className="k">{r.statut === "trouvee" ? "Le bien se trouve probablement au" : "Adresse la plus probable"}</span>
              <span className="v" style={{ fontSize: 24 }}>{top.adresse ?? "—"}</span>
              <span className="d">
                {[top.complement, top.etage !== undefined && top.etage !== null && top.etage !== "" ? `étage ${top.etage}` : null, top.surface ? `${nf(top.surface, 1)} m²` : null, top.conso !== undefined ? `${nf(top.conso)} kWh/m²/an` : null, top.date ? `DPE de ${dateFr(top.date)}` : null].filter(Boolean).join(" · ")}
              </span>
              <span className="d">Correspond par : {top.criteres.join(", ")}.</span>
              <div className="btns" style={{ marginTop: 4 }}>
                {r.confiance && <span className={`pill ${CONF[r.confiance][0]}`} style={{ marginTop: 0 }}>{CONF[r.confiance][1]}</span>}
                {top.lat && top.lon && (
                  <>
                    <a className="btn ghost" href={`https://www.openstreetmap.org/?mlat=${top.lat}&mlon=${top.lon}#map=18/${top.lat}/${top.lon}`} target="_blank" rel="noopener noreferrer">Voir sur la carte</a>
                    <a className="btn ghost" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${top.lat},${top.lon}`} target="_blank" rel="noopener noreferrer">Street View</a>
                    {!positionUtilisee && <button type="button" onClick={() => onPosition(top.lat!, top.lon!, top.adresse ?? "")}>Comparer aux ventes autour de cette adresse</button>}
                  </>
                )}
              </div>
              <p className="hint">{r.message}</p>
            </div>
          ) : (
            <p className="msg warn">{r.message}</p>
          )}

          {r.candidats.length > 1 && (
            <details style={{ marginTop: 10 }}>
              <summary className="hint" style={{ cursor: "pointer" }}>Autres DPE proches ({r.candidats.length - 1})</summary>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Adresse</th><th>Étage</th><th>Surface</th><th>kWh/m²</th><th>CO₂/m²</th><th>Date</th><th>Score</th></tr></thead>
                <tbody>{r.candidats.slice(1).map((c) => (
                  <tr key={c.numero}><td>{c.adresse}</td><td>{c.etage ?? "—"}</td><td>{nf(c.surface, 1)}</td><td>{nf(c.conso)}</td><td>{nf(c.ges)}</td><td>{c.date ? dateFr(c.date) : "—"}</td><td>{c.score}</td></tr>
                ))}</tbody>
              </table></div>
            </details>
          )}

          {r.ventesAdresse.length > 0 && (
            <>
              <div className="section-title"><h3>Déjà vendus à cette adresse</h3><span className="count">{r.ventesAdresse.length} ventes DVF</span></div>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Date</th><th>Type</th><th>Surface</th><th>Pièces</th><th>Prix</th><th>€/m²</th></tr></thead>
                <tbody>{r.ventesAdresse.map((v, i) => (
                  <tr key={i}><td>{dateFr(v.d)}</td><td>{v.t === "M" ? "Maison" : "Appartement"}</td><td>{v.s} m²</td><td>{v.n ?? "—"}</td><td>{eur(v.p)}</td><td>{eur(v.p / v.s)}</td></tr>
                ))}</tbody>
              </table></div>
              <p className="hint">Si une vente a la même surface que l'annonce, c'est peut-être ce bien lui-même : comparez le prix payé alors au prix demandé aujourd'hui.</p>
            </>
          )}
          <p className="note">Adresse déduite des diagnostics publiés en open data par l'ADEME (DPE réalisés depuis juillet 2021) : à confirmer à la visite. À utiliser pour vérifier l'environnement du bien, pas pour démarcher le vendeur.</p>
        </>
      )}
    </section>
  );
}
