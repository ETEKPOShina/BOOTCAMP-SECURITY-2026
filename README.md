# WeZonPass — prototype

Plateforme de pré-enregistrement des passagers et de suivi des voyages pour le corridor Lomé ↔ Cotonou
(postes de Sanvee-Condji et Hillacondji). **Environnement de démonstration — données fictives.**

## Lancer

```bash
npm install
npm run dev          # http://localhost:5173
```

Connexion : utilisez le sélecteur « Connexion de démonstration » de la page `/login`
(mot de passe commun `demo2026`). Les données sont conservées dans le `localStorage` du navigateur ;
« Réinitialiser les données de démonstration » restaure le jeu initial. Deux onglets d'un même
navigateur restent synchronisés (pratique pour jouer plusieurs rôles).

## Vérifications

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run e2e              # parcours complet multi-rôles (serveur de dev lancé)
npm run check:a11y       # débordements 320→1920 px + axe-core WCAG 2.2 AA
```

## Architecture

- React 19 + TypeScript + Vite, React Router, Lucide, `qrcode`, Poppins (`@fontsource`, licence OFL, sous-ensemble latin).
- `src/domain` : modèle de données, libellés français, matrice d'habilitations, règles (documents, corridor, vérification simulée).
- `src/services/api.ts` : **serveur de démonstration** — chaque opération vérifie habilitation + organisation, journalise (y compris les refus).
- `src/services/queries.ts` : lectures cloisonnées par rôle ; les données police ne sont lues que par les fonctions police / poste frontalier.
- `src/pages/{agency,police,border,customs,admin,driver}` : un module chargé à la demande par espace.
- Charte : `src/styles/tokens.css` (#5811D6, #12D636, #D67A11), logos fournis dans `public/brand/` (marges transparentes rognées, logo inchangé).

## Simulé (non connecté)

Transmission des manifestes et accusés de réception ; vérification police (règles fictives, préfixe « ZZ » = rouge) ;
lecture MRZ/NFC, capture et confirmation faciale ; SMS ; positions GPS (frise d'itinéraire, pas de carte) ;
impression d'étiquettes ; authentification (démo, sans serveur). Aucune image n'est conservée : seules les métadonnées.

## Avant toute production

Backend avec autorisation côté serveur et authentification réelle ; bus de messages et modules police installés
dans l'infrastructure de chaque police ; stockage chiffré et purge effective (72 h / 12 mois / 3 ans, **règles proposées**) ;
validation juridique et déclarations auprès de l'IPDCP (Togo) et de l'APDP (Bénin) ; politique de confidentialité définitive ;
application Android (Flutter) avec stockage hors ligne sécurisé ; intégrations SMS/USSD, GPS, cartographie.
