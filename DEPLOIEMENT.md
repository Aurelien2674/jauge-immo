# Jauge Immo — mise en ligne

Application d'analyse d'annonces immobilières : prix face aux ventes réelles (DVF), loyer de marché, coût mensuel, points à vérifier, et 6 simulateurs.

**Pile :** React + Vite (interface), fonctions Vercel dans `api/` (lecture d'annonce, données de marché), Supabase (comptes, analyses enregistrées, cache DVF, loyers).

L'application fonctionne déjà **sans Supabase** (analyse + simulateurs). Supabase ajoute les comptes, l'enregistrement, le partage, le cache des ventes et les loyers de marché.

---

## 1. Supabase (10 min)

1. Sur https://supabase.com → **New project** (nom : `jauge-immo`, région : Paris / eu-west-3).
2. **SQL Editor → New query** : collez le contenu de `supabase/schema.sql` → **Run**.
3. **Authentication → URL Configuration** :
   - *Site URL* : l'adresse Vercel (ex. `https://jauge-immo.vercel.app`)
   - *Redirect URLs* : ajoutez `https://jauge-immo.vercel.app/**`
4. **Project Settings → API** : notez
   - `Project URL`
   - `anon public` (clé publique)
   - `service_role` (clé **secrète** — à ne mettre que dans Vercel, jamais dans le code)

## 2. Vercel (5 min)

1. https://vercel.com → **Add New → Project** → importez le dépôt GitHub `jauge-immo`.
2. *Framework* : Vite (détecté automatiquement). Ne changez rien d'autre.
3. **Environment Variables** — ajoutez :

| Nom | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | clé `anon public` |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | clé `service_role` |
| `ADMIN_EMAIL` | votre adresse e-mail (pour importer les loyers) |

4. **Deploy**. Après toute modification des variables : *Deployments → … → Redeploy*.

## 3. Loyers de marché (une fois par an)

1. Téléchargez les 4 fichiers CSV de la « Carte des loyers » : https://www.data.gouv.fr/datasets/693aa2feed1bf4da603faa49/ (appartements, appartements T1-T2, appartements T3 et plus, maisons).
2. Sur votre site, connectez-vous avec l'adresse `ADMIN_EMAIL`, puis ouvrez `/admin`.
3. Pour chaque fichier : choisissez le type correspondant, puis sélectionnez le fichier. L'import prend quelques secondes.

## Comment ça marche

- **Lien d'annonce** (`api/annonce.ts`) : Bien'ici est lu via son JSON public (fiable). Leboncoin, SeLoger et les autres sont lus quand leur page le permet ; s'ils bloquent (protection anti-robot), l'utilisateur colle le texte et l'extraction se fait dans le navigateur.
- **Marché** (`api/marche.ts`) : commune trouvée via l'API Géo, ventes DVF téléchargées depuis `files.data.gouv.fr/geo-dvf` (5 dernières années), mises en cache 30 jours dans Supabase. Comparables : même type, surface ±35 %, 36 derniers mois, dans un rayon de 500 m à 1,5 km quand la position du bien est connue, sinon toute la commune.
- **Calculs** : `src/lib/calc.ts` (barèmes 2026 : DMTO par département, émoluments, PTZ, HCSF). `npm test` vérifie les formules.

## Développement local

```bash
npm install
cp .env.example .env.local   # puis remplissez les valeurs
npx vercel dev               # interface + fonctions api/ sur http://localhost:3000
npm test
```

## À mettre à jour

- `DEPARTEMENTS_TAUX_REDUIT` dans `src/lib/calc.ts` quand un département change son taux (liste officielle : impots.gouv.fr, fichier DMTO).
- Barèmes `PTZ` dans `src/lib/calc.ts` à chaque loi de finances.
