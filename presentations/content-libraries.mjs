// U21 keeps the shorter narrative and adds concrete library explanations.
import assert from 'node:assert/strict';
import { slides as previous } from './content-condensed.mjs';

export const slides = structuredClone(previous);
const replace = (title, change) => {
  const slide = slides.find(s => s.title === title);
  assert(slide, `Unknown source slide: ${title}`);
  Object.assign(slide, change);
};
const after = (title, slide) => {
  const index = slides.findIndex(s => s.title === title);
  assert(index >= 0, `Unknown insertion point: ${title}`);
  slides.splice(index + 1, 0, slide);
};
const columns = ['BIBLIOTHÈQUE', 'FONCTION', 'APPLICATION DANS GENESIS'];
const columnWidths = [245, 380, 527];

replace('Interface et visualisations', {
  kind: 'table', columns, columnWidths,
  rows: [
    ['React + React DOM', 'Décrire les composants et actualiser la page.', 'Une sélection de tournée met à jour les détails affichés.'],
    ['TypeScript', 'Vérifier les types pendant la compilation.', 'Signaler un champ absent dans le contrat d’une tournée.'],
    ['ECharts', 'Dessiner des graphiques à partir de séries.', 'Afficher tokens, coûts, durées et scénarios comparables.'],
    ['React Flow', 'Afficher un graphe interactif de nœuds et liens.', 'Relier les cinq rôles aux preuves transmises.'],
  ],
  caption: 'React Flow affiche le workflow. LangGraph exécute les rôles côté serveur.',
  notes: previous[6].notes + '\n\nReact décrit les composants et leur état. React DOM applique leurs changements aux éléments du navigateur. App.tsx relie le choix de mission aux vues. TypeScript aide le développeur avant l’exécution, mais ne filtre pas à lui seul une requête réseau. ECharts reçoit les agrégats calculés par le produit et les transforme en visuels. React Flow affiche des transmissions déjà enregistrées. Il ne décide ni de l’ordre des agents ni de l’affectation des véhicules. Les séries et tableaux conservent les mêmes unités et valeurs manquantes.',
});
replace('API et validation des entrées', {
  kind: 'table', columns, columnWidths,
  rows: [
    ['Uvicorn', 'Recevoir HTTP et exécuter l’application ASGI.', 'Faire écouter le serveur local de l’API Genesis.'],
    ['FastAPI', 'Associer une URL à une fonction Python.', 'Recevoir une commande et publier le schéma OpenAPI.'],
    ['Pydantic', 'Vérifier les champs, types et limites.', 'Refuser une capacité invalide ou un champ inconnu.'],
    ['HTTPX', 'Envoyer des requêtes HTTP avec délais bornés.', 'Interroger Photon et OSRM puis contrôler la réponse.'],
  ],
  caption: 'La validation des données précède les écritures et la préparation du plan.',
  notes: previous[7].notes + '\n\nASGI est le contrat qui relie un serveur Python asynchrone à l’application. Uvicorn reçoit la connexion. FastAPI sélectionne la route et utilise Pydantic pour interpréter les données. Les handlers appliquent ensuite les règles métier et appellent le Store. HTTPX agit comme client vers les services cartographiques, dans le sens sortant. Cette séparation permet de tester les routes sans appeler un fournisseur réel et de substituer les réponses routières dans le profil QA.',
});
replace('Persistance et exécution durable', {
  kind: 'table', columns, columnWidths,
  rows: [
    ['SQLAlchemy', 'Construire les accès SQL et les transactions.', 'Enregistrer ensemble la commande, son état et ses liens.'],
    ['SQLite', 'Stocker les tables dans une base locale.', 'Conserver commandes, événements et budget entre sessions.'],
    ['SqliteSaver', 'Enregistrer les checkpoints de LangGraph.', 'Conserver l’état du graphe dans une autre base SQLite.'],
    ['Psycopg', 'Relier Python à PostgreSQL.', 'Profil configurable, dont l’exécution locale reste à valider.'],
  ],
  caption: 'Une sauvegarde de la base application n’inclut pas automatiquement les checkpoints.',
  notes: previous[8].notes + '\n\nSQLAlchemy ne remplace pas le moteur de base. Il construit les opérations et délimite les transactions. SQLite les stocke dans le profil démontré. Le paquet langgraph-checkpoint-sqlite fournit SqliteSaver, appelé par workflow.py pour une autre responsabilité : l’état de la machine de workflow. La cohérence entre ces deux bases et les effets externes demande un protocole applicatif. Psycopg est un pilote PostgreSQL et psycopg-pool gère la réutilisation de connexions lorsqu’un chemin le sélectionne. Leur installation seule ne prouve pas le fonctionnement du profil PostgreSQL.',
});

after('Architecture du profil local', {
  kind: 'allocation', title: 'Bibliothèque, dépendance et service',
  items: [
    ['Bibliothèque', 'Du code importé par l’application. OR-Tools calcule un candidat de tournée.'],
    ['Dépendance', 'Un paquet nécessaire à un autre. FastAPI s’appuie sur Starlette.'],
    ['Service externe', 'Un système joint par réseau. OSRM répond avec des temps et des routes.'],
  ],
  caption: 'Les versions épinglées stabilisent l’installation. Elles ne prouvent pas un usage actif.',
  notes: 'Une bibliothèque est du code réutilisable. Une dépendance décrit une relation entre paquets. Le même paquet peut être une bibliothèque utilisée directement et une dépendance d’une autre bibliothèque. Un framework comme FastAPI donne aussi une structure à l’application. Un SDK comme Anthropic expose des fonctions client pour un service distant. Les services Photon, OSRM et les tuiles cartographiques ne sont pas des bibliothèques Python installées dans Genesis. Les 87 distributions Python sont toutes épinglées dans requirements.txt, y compris leurs dépendances de support. Les manifestes web et QA déclarent 17 dépendances directes. Leurs lockfiles décrivent les paquets transitifs. Une relation de dépendance ne décrit pas nécessairement l’ordre des opérations métier.',
  sources: ['requirements.txt', 'apps/web/package.json', 'qa/package.json', 'presentations/package-details.json', 'services/genesis/dispatch.py'],
});
after('Persistance et exécution durable', {
  kind: 'sequence', title: 'Une commande traverse plusieurs bibliothèques',
  steps: [
    ['React', 'Le répartiteur saisit puis confirme sa commande.'],
    ['FastAPI + Pydantic', 'Le serveur reçoit et valide les champs.'],
    ['SQLAlchemy', 'La transaction enregistre une commande cohérente.'],
    ['LangGraph', 'Lors de la planification, le worker coordonne les rôles.'],
  ],
  caption: 'Ce parcours décrit le flux de travail. Il ne représente pas les dépendances d’installation.',
  notes: 'OrderBoard prépare les données déjà choisies et appelle l’API. Pydantic valide la forme et les bornes, puis orders.py applique référence unique et règles de contenu. SQLAlchemy permet au Store d’enregistrer ou de refuser tout le lot dans une transaction. Sauvegarder une commande ne lance pas automatiquement une tournée. Le répartiteur sélectionne ensuite les commandes, puis le serveur crée une demande persistante que le worker réclame. LangGraph organise alors les rôles, qui utilisent leurs outils déterministes. Une proposition certifiée attend encore une action explicite de départ simulé. Chaque bibliothèque couvre une responsabilité précise, tandis que le code Genesis définit ce parcours métier.',
  sources: ['apps/web/src/OrderBoard.tsx', 'services/genesis/orders.py', 'services/genesis/db.py', 'services/genesis/broker_api.py', 'services/genesis/broker_runtime.py'],
});
after('Un véhicule ou plusieurs', {
  kind: 'split', title: 'OR-Tools et le calcul des tournées',
  leftTitle: 'Ce que Genesis fournit',
  left: 'Temps et distances de la matrice\nCapacités et positions de la flotte\nRamassages avant leurs livraisons\nDélais, service et fonction de coût',
  rightTitle: 'Ce que le solveur retourne',
  right: 'Affectation à un véhicule\nOrdre de visite des arrêts\nCandidat trouvé dans le temps alloué\nRésultat à contrôler indépendamment',
  caption: 'OR-Tools cherche une solution sous contraintes. Le modèle IA peut ensuite expliquer le résultat.',
  notes: 'OR-Tools RoutingModel recherche une affectation et une séquence à partir des dimensions et contraintes créées par Genesis. La matrice dirigée distingue le temps de A vers B de celui de B vers A. Les règles de ramassage et de livraison imposent la précédence, les contraintes de véhicule et la capacité pendant le trajet. Le coût assemble des hypothèses configurées plutôt qu’un tarif commercial universel. Le temps de recherche est borné. Le code de contrôle recalcule les charges, temps et couverture sur les entrées figées, puis vérifie les géométries et l’admission. Un candidat valide n’est pas une preuve d’optimum global. NumPy, Pandas, protobuf, Abseil et immutabledict sont des dépendances du paquet OR-Tools. Leur présence ne signifie pas que Genesis entraîne un modèle ou réalise une analyse Pandas.',
  sources: ['services/genesis/broker_solver.py', 'services/genesis/solver.py', 'services/genesis/dispatch.py', 'presentations/package-details.json'],
});
after('Le benchmark de référence', {
  kind: 'table', title: 'Construire et vérifier le logiciel', columns, columnWidths,
  rows: [
    ['Vite + plugin React', 'Transformer les modules et assembler le site.', 'Servir le développement et produire le bundle web.'],
    ['TypeScript', 'Détecter les incohérences de types.', 'Bloquer le build si les contrats web sont incompatibles.'],
    ['Vitest', 'Exécuter les assertions de l’interface.', 'Vérifier les filtres, états et transformations de données.'],
    ['pytest + Ruff', 'Tester Python et analyser son code.', 'Contrôler budget, capacité, reprises et erreurs de code.'],
    ['Playwright + axe', 'Piloter le navigateur et signaler des défauts.', 'Définir les parcours et les contrôles d’accessibilité QA.'],
  ],
  caption: 'Un outil installé et des tests écrits ne prouvent pas que chaque parcours a été exécuté.',
  notes: 'Vite utilise la chaîne de compilation du frontend. Le plugin React prend en charge sa transformation et le rafraîchissement pendant le développement. La commande de build exécute TypeScript avant Vite. Vitest exécute les tests web, tandis que pytest exécute les fixtures et assertions backend. Ruff détecte des erreurs et incohérences statiques, sans démontrer l’absence de défaut fonctionnel. Playwright décrit des parcours de navigateur. @axe-core/playwright branche axe sur ces pages pour une partie des règles d’accessibilité. Les contrôles MCP documentés et les suites Playwright sont des preuves distinctes. Les quatre tests du harness isolé vérifient aussi les frontières du profil QA. Les notes de référence distinguent outils de développement et bibliothèques exécutées par le produit.',
  sources: ['apps/web/package.json', 'apps/web/vite.config.ts', 'apps/web/tsconfig.json', 'qa/package.json', 'docs/QA.md', 'scripts/check.ps1', 'presentations/package-details.json'],
});

assert.equal(slides.length, 30);

export const referenceGroups = {
  runtime: { title: 'Les bibliothèques et leur support', rows: [
    ['FastAPI', 'Starlette + Pydantic', 'Acheminer les requêtes et valider les données.'],
    ['LangGraph', 'Checkpoint + prebuilt + SDK', 'Fournir les composants du moteur de graphe.'],
    ['OR-Tools', 'NumPy + Pandas + protobuf', 'Support numérique et données du paquet solveur.'],
    ['Anthropic', 'HTTPX2 + Pydantic', 'Transport du SDK et représentation des réponses.'],
    ['SQLAlchemy', 'typing-extensions', 'Support des annotations de types entre versions Python.'],
  ]},
  support: { title: 'Ce que font les dépendances de support', rows: [
    ['Starlette + AnyIO', 'Web et concurrence', 'Supporter les requêtes, réponses et tâches ASGI.'],
    ['HTTPcore + certifi', 'Transport HTTPX', 'Gérer connexions HTTP et certificats TLS.'],
    ['HTTPcore2 + truststore', 'Transport HTTPX2', 'Transport et certificats du SDK Anthropic.'],
    ['Pydantic-core', 'Validation compilée', 'Appliquer les règles des modèles Pydantic.'],
    ['OpenTelemetry', 'API, SDK, OTLP, protobuf', 'Décrire, traiter et transmettre les traces via Langfuse.'],
  ]},
  optional: { title: 'Les intégrations optionnelles', rows: [
    ['Langfuse', 'Inspection de traces', 'Copie expurgée de l’outbox si configuré.'],
    ['Psycopg', 'Pilote PostgreSQL', 'Exécuter SQL contre le profil PostgreSQL choisi.'],
    ['Psycopg-pool', 'Connexions réutilisables', 'Servir un pool si le chemin le sélectionne.'],
    ['Checkpoint PostgreSQL', 'État du graphe en SQL', 'Saver alternatif au SqliteSaver local.'],
  ]},
  tooling: { title: 'Les dépendances des tests Python', rows: [
    ['pytest', 'Moteur de tests', 'Découvrir les cas, fixtures et assertions backend.'],
    ['Pluggy', 'Points d’extension', 'Brancher les plugins dans le cycle de pytest.'],
    ['Iniconfig', 'Lecture de configuration', 'Interpréter les réglages INI utilisés par pytest.'],
    ['Pygments + Colorama', 'Sortie du terminal', 'Colorer les erreurs et adapter le terminal Windows.'],
    ['Ruff', 'Analyse statique', 'Repérer les erreurs de code et imports incohérents.'],
  ]},
  installed: { title: 'Paquets sans import métier direct', rows: [
    ['NumPy + Pandas', 'Calcul et tables', 'Requis par OR-Tools, sans analyse métier directe ici.'],
    ['sqlite-vec', 'Vecteurs dans SQLite', 'Requis par le saver, sans mémoire vectorielle produit.'],
    ['aiosqlite', 'SQLite asynchrone', 'Support du saver, Genesis choisit le mode synchrone.'],
    ['Alembic + Mako', 'Migrations et gabarits', 'Installés, sans migrations Alembic actives démontrées.'],
    ['Requests', 'Client HTTP', 'Présent via des dépendances, sans client métier direct.'],
  ]},
};
export const webReference = {
  title: 'Les dépendances web et QA',
  columns: ['GROUPE', 'PAQUETS', 'USAGE CONCRET'], columnWidths: [230, 442, 480],
  rows: [
    ['Interface', 'React + React DOM', 'État et affichage dans le navigateur.'],
    ['Données visuelles', 'ECharts + React Flow + MapLibre', 'Graphiques, rôles et carte géographique.'],
    ['Présentation', 'Lucide + Inter', 'Icônes et police servie localement.'],
    ['Développement', 'Vite, plugin React, TypeScript, types, Prettier', 'Assembler et vérifier les types. Prettier déclaré.'],
    ['Vérification', 'Vitest + Playwright + axe', 'Tests, parcours navigateur et accessibilité.'],
  ],
};
