import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parseAnnonceText } from "../../shared/parse";
import type { Bien } from "../../shared/types";
import { lireAnnonce } from "../lib/api";
import { BIEN_VIDE, ecrireBrouillon, finSauvee } from "../lib/draft";
import { SIMULATEURS } from "../App";

export default function Home() {
  const nav = useNavigate();
  const [url, setUrl] = useState("");
  const [texte, setTexte] = useState("");
  const [montrerTexte, setMontrerTexte] = useState(false);
  const [charge, setCharge] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  const ouvrir = (b: Partial<Bien>) => {
    ecrireBrouillon({ ...BIEN_VIDE, ...b } as Bien, finSauvee());
    nav("/analyse");
  };

  async function analyserLien(e: React.FormEvent) {
    e.preventDefault();
    const v = url.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) { setMontrerTexte(true); setTexte(v); setMsg({ t: "Ce n'est pas un lien : on analyse le texte ci-dessous." }); return; }
    setCharge(true); setMsg(null);
    const r = await lireAnnonce(v);
    setCharge(false);
    if (r.ok && r.bien) return ouvrir({ ...r.bien, url: v });
    setMontrerTexte(true);
    setMsg({ t: r.message || r.erreur || "Lecture impossible. Collez le texte de l'annonce.", err: !r.message });
  }

  function analyserTexte() {
    const b = parseAnnonceText(texte);
    if (!b.prix && !b.surface) { setMsg({ t: "Ni prix ni surface trouvés dans ce texte. Vérifiez que vous avez copié toute l'annonce.", err: true }); return; }
    ouvrir({ ...b, url: url.startsWith("http") ? url : undefined, source: "texte collé" });
  }

  return (
    <>
      <section className="hero">
        <h1>Ce que l'annonce <em>ne dit pas.</em></h1>
        <p className="lede">Collez le lien d'une annonce : Jauge Immo compare le prix aux ventes réelles autour du bien, estime le loyer de marché, le coût mensuel, et liste ce qu'il faut vérifier avant d'acheter.</p>
        <form className="hero-form" onSubmit={analyserLien}>
          <input aria-label="Lien de l'annonce à analyser" placeholder="https://www.bienici.com/annonce/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" disabled={charge}>{charge ? "Lecture…" : "Analyser"}</button>
        </form>
        <p className="sites">Bien'ici, Leboncoin, SeLoger, PAP, Logic-Immo et les principaux réseaux d'agences. · <button type="button" className="ghost" style={{ padding: "2px 8px" }} onClick={() => setMontrerTexte((v) => !v)}>Coller le texte à la place</button> · <Link to="/analyse?exemple">Voir un exemple</Link> · <a href="#" onClick={(e) => { e.preventDefault(); ouvrir({}); }}>Saisir à la main</a></p>
        {msg && <p className={`msg ${msg.err ? "err" : "warn"}`} style={{ maxWidth: 760 }} role="status">{msg.t}</p>}
        {montrerTexte && (
          <div className="paste form">
            <label htmlFor="texte">Texte de l'annonce
              <textarea id="texte" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Sélectionnez tout le texte de la page de l'annonce (titre, prix, description, DPE…) et collez-le ici." />
            </label>
            <div className="btns"><button type="button" onClick={analyserTexte}>Analyser ce texte</button></div>
          </div>
        )}
      </section>

      <section className="features">
        <div className="feature"><h3>Prix face aux ventes réelles</h3><p>Les ventes notariées (DVF) de la commune, filtrées par type et surface, au plus près du bien quand sa position est connue.</p></div>
        <div className="feature"><h3>Coût réel chaque mois</h3><p>Mensualité, charges, taxe foncière et énergie estimée d'après le DPE, comparés au loyer de marché.</p></div>
        <div className="feature"><h3>Points à vérifier</h3><p>DPE et interdictions de louer, copropriété, diagnostics, risques, endettement : la liste avant de faire une offre.</p></div>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>Un calcul précis pour chaque question</h2>
        <div className="sim-list">
          {SIMULATEURS.map((s) => (
            <Link key={s.path} className="sim-card" to={`/simulateurs/${s.path}`}><b>{s.nom}</b><span>{s.q}</span></Link>
          ))}
        </div>
      </section>
    </>
  );
}
