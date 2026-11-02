import { NavLink, Route, Routes, Link } from "react-router-dom";
import { Logo } from "./components/ui";
import Home from "./pages/Home";
import Analyse from "./pages/Analyse";
import { Capacite, Mensualite, FraisPage, Rentabilite, AcheterLouer, PtzPage, SimIndex } from "./pages/sim/Simulateurs";
import { Connexion, MesAnalyses, Admin } from "./pages/Compte";
import { useSession } from "./lib/session";
import { supabase } from "./lib/supabase";

export const SIMULATEURS = [
  { path: "capacite-achat", nom: "Capacité d'achat", q: "Quel budget pouvez-vous envisager ?" },
  { path: "mensualite", nom: "Mensualité de prêt", q: "Combien coûterait votre prêt chaque mois ?" },
  { path: "frais-notaire", nom: "Frais d'acquisition", q: "Quels frais prévoir en plus du prix ?" },
  { path: "rentabilite-locative", nom: "Rentabilité locative", q: "Que reste-t-il après les charges ?" },
  { path: "acheter-ou-louer", nom: "Acheter ou louer", q: "Quel scénario vous enrichit le plus ?" },
  { path: "ptz", nom: "Prêt à taux zéro", q: "Votre projet entre-t-il dans le PTZ ?" },
];

export default function App() {
  const { session } = useSession();
  return (
    <div className="wrap">
      <header className="top">
        <Link className="brand" to="/"><Logo />Jauge Immo</Link>
        <div className="top-links">
          {supabase && (session
            ? <NavLink to="/mes-analyses">Mes analyses</NavLink>
            : <NavLink to="/connexion">Connexion</NavLink>)}
        </div>
      </header>
      <nav className="tabs" aria-label="Sections">
        <NavLink to="/analyse">Analyser une annonce</NavLink>
        <span className="sep" aria-hidden="true" />
        {SIMULATEURS.map((s) => <NavLink key={s.path} to={`/simulateurs/${s.path}`}>{s.nom}</NavLink>)}
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/analyse" element={<Analyse />} />
          <Route path="/r/:id" element={<Analyse />} />
          <Route path="/simulateurs" element={<SimIndex />} />
          <Route path="/simulateurs/capacite-achat" element={<Capacite />} />
          <Route path="/simulateurs/mensualite" element={<Mensualite />} />
          <Route path="/simulateurs/frais-notaire" element={<FraisPage />} />
          <Route path="/simulateurs/rentabilite-locative" element={<Rentabilite />} />
          <Route path="/simulateurs/acheter-ou-louer" element={<AcheterLouer />} />
          <Route path="/simulateurs/ptz" element={<PtzPage />} />
          <Route path="/connexion" element={<Connexion />} />
          <Route path="/mes-analyses" element={<MesAnalyses />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<div className="panel"><h2>Page introuvable</h2><p><Link to="/">Retour à l'accueil</Link></p></div>} />
        </Routes>
      </main>
      <footer>
        <span>Estimations pédagogiques et comparatives, sans valeur de conseil en investissement ou en crédit. Vérifiez auprès d'un notaire, d'un courtier ou de votre banque avant de vous engager.</span>
        <span>Données : ventes DVF (DGFiP, Etalab), Carte des loyers (ministère du Logement), API Géo. Barèmes : DMTO au 1<sup>er</sup> avril 2026, émoluments des notaires, PTZ 2026, règles HCSF.</span>
      </footer>
    </div>
  );
}
