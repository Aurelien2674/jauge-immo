import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { splitCsvLine } from "../../shared/dvf";
import { eur, nf } from "../lib/format";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";

function NonConfigure() {
  return <div className="panel"><h2>Comptes non activés</h2><p>Les variables Supabase ne sont pas encore renseignées dans Vercel. Les analyses et simulateurs restent utilisables sans compte.</p></div>;
}

export function Connexion() {
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [err, setErr] = useState("");
  const [sp] = useSearchParams();
  const { session } = useSession();
  const nav = useNavigate();
  useEffect(() => { if (session) nav(sp.get("retour") || "/mes-analyses"); }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!supabase) return <NonConfigure />;

  async function envoyer(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}${sp.get("retour") || "/mes-analyses"}` } });
    if (error) setErr(error.message); else setEnvoye(true);
  }
  return (
    <div style={{ maxWidth: 460 }}>
      <h1>Connexion</h1>
      <p className="lede">Pour enregistrer vos analyses et les retrouver sur tous vos appareils. Pas de mot de passe : vous recevez un lien de connexion par e-mail.</p>
      {envoye ? <p className="msg">Lien envoyé à {email}. Ouvrez-le depuis cet appareil pour vous connecter.</p> : (
        <form className="panel form" onSubmit={envoyer}>
          <label htmlFor="email">Adresse e-mail<input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button type="submit">Recevoir le lien de connexion</button>
          {err && <p className="msg err">{err}</p>}
        </form>
      )}
    </div>
  );
}

interface Ligne { id: string; titre: string; created_at: string; public: boolean; bien: { prix: number; surface: number } }

export function MesAnalyses() {
  const { session, pret } = useSession();
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [confirmer, setConfirmer] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase || !session) return;
    supabase.from("analyses").select("id,titre,created_at,public,bien").eq("user_id", session.user.id).order("created_at", { ascending: false }).then(({ data }) => setLignes((data as Ligne[]) ?? []));
  }, [session]);
  if (!supabase) return <NonConfigure />;
  if (pret && !session) return <div className="panel"><p>Connectez-vous pour voir vos analyses. <Link to="/connexion?retour=/mes-analyses">Se connecter</Link></p></div>;

  async function supprimer(id: string) {
    await supabase!.from("analyses").delete().eq("id", id);
    setLignes((l) => l?.filter((x) => x.id !== id) ?? null); setConfirmer(null);
  }
  return (
    <>
      <div className="section-title"><h1 style={{ marginBottom: 0 }}>Mes analyses</h1>
        <div className="btns"><Link className="btn" to="/">Nouvelle analyse</Link><button className="ghost" onClick={() => supabase!.auth.signOut()}>Se déconnecter</button></div></div>
      <p className="hint" style={{ marginBottom: 14 }}>{session?.user.email}</p>
      {lignes === null ? <div className="skeleton" /> : lignes.length === 0 ? <div className="panel"><p>Aucune analyse enregistrée. Analysez une annonce puis cliquez sur « Enregistrer l'analyse ».</p></div> : (
        <div className="list">
          {lignes.map((l) => (
            <div className="list-item" key={l.id}>
              <div><Link to={`/r/${l.id}`}>{l.titre}</Link><div className="hint">{eur(l.bien.prix)} · {nf(l.bien.surface)} m² · {new Date(l.created_at).toLocaleDateString("fr-FR")}{l.public ? " · partagée" : ""}</div></div>
              {confirmer === l.id
                ? <div className="btns"><button onClick={() => supprimer(l.id)}>Confirmer</button><button className="ghost" onClick={() => setConfirmer(null)}>Annuler</button></div>
                : <button className="ghost" onClick={() => setConfirmer(l.id)}>Supprimer</button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Administration : import de la Carte des loyers ---------- */
const TYPES: [string, string][] = [["appartement", "Appartements (toutes tailles)"], ["appartement_t12", "Appartements T1-T2"], ["appartement_t3plus", "Appartements T3 et plus"], ["maison", "Maisons"]];

function lireCarteLoyers(buf: ArrayBuffer) {
  let txt = new TextDecoder("utf-8").decode(buf);
  if (txt.includes("�")) txt = new TextDecoder("windows-1252").decode(buf);
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const sep = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const h = splitCsvLine(lines[0], sep).map((x) => x.trim().toLowerCase());
  const col = (...noms: string[]) => h.findIndex((x) => noms.includes(x));
  const I = { insee: col("insee_c", "insee", "code_insee"), lib: col("libgeo", "lib_com"), loy: col("loypredm2", "loyer_m2"), bas: col("lwr.ipm2"), haut: col("upr.ipm2"), nb: col("nbobs_com") };
  if (I.insee < 0 || I.loy < 0) throw new Error("Colonnes INSEE_C et loypredm2 introuvables : est-ce bien un fichier de la Carte des loyers ?");
  const n = (s?: string) => { const v = parseFloat(String(s ?? "").replace(",", ".")); return isFinite(v) ? v : null; };
  return lines.slice(1).map((l) => {
    const r = splitCsvLine(l, sep);
    return { insee: (r[I.insee] ?? "").trim().padStart(5, "0"), libelle: I.lib >= 0 ? r[I.lib] : null, loyer_m2: n(r[I.loy]), bas_m2: I.bas >= 0 ? n(r[I.bas]) : null, haut_m2: I.haut >= 0 ? n(r[I.haut]) : null, nb_obs: I.nb >= 0 ? n(r[I.nb]) : null };
  }).filter((r) => r.loyer_m2);
}

export function Admin() {
  const { session } = useSession();
  const [type, setType] = useState("appartement");
  const [millesime, setMillesime] = useState(2025);
  const [etat, setEtat] = useState("");
  if (!supabase) return <NonConfigure />;
  if (!session) return <div className="panel"><p><Link to="/connexion?retour=/admin">Connectez-vous</Link> avec l'adresse administrateur.</p></div>;

  async function importer(f: File) {
    try {
      const rows = lireCarteLoyers(await f.arrayBuffer());
      let total = 0;
      for (let i = 0; i < rows.length; i += 2000) {
        setEtat(`Envoi… ${nf(i)} / ${nf(rows.length)} communes`);
        const r = await fetch("/api/import-loyers", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session!.access_token}` }, body: JSON.stringify({ type, millesime, rows: rows.slice(i, i + 2000) }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.erreur);
        total += d.importes;
      }
      setEtat(`Terminé : ${nf(total)} communes importées pour « ${TYPES.find((t) => t[0] === type)![1]} ».`);
    } catch (e: any) { setEtat("Échec : " + e.message); }
  }
  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Loyers de marché</h1>
      <p className="lede">Importez les fichiers CSV de la « Carte des loyers » publiés sur data.gouv.fr (un fichier par type de logement). À refaire une fois par an, à chaque nouveau millésime.</p>
      <div className="panel form">
        <label htmlFor="t">Type de logement du fichier<select id="t" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label htmlFor="m">Millésime<input id="m" inputMode="numeric" value={millesime} onChange={(e) => setMillesime(+e.target.value || 2025)} /></label>
        <label htmlFor="f">Fichier CSV<input id="f" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && importer(e.target.files[0])} /></label>
        {etat && <p className="msg" role="status">{etat}</p>}
        <p className="hint">Source : <a href="https://www.data.gouv.fr/datasets/693aa2feed1bf4da603faa49/" target="_blank" rel="noopener noreferrer">Carte des loyers 2025 sur data.gouv.fr</a>. Seule l'adresse définie dans ADMIN_EMAIL peut importer.</p>
      </div>
    </div>
  );
}
