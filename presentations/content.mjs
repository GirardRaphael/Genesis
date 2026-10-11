export const slides = [{kind:'cover',title:'Architecture, technologies\net fonctionnement',subtitle:'Observatoire multiagents pour la logistique montréalaise\nDossier technique · 11 octobre 2026',notes:'Cette présentation décrit le code du projet Genesis et son profil local vérifié. Les noms de modèles et versions de dépendances correspondent au dépôt, et non aux dernières versions du marché. Le système actuel reste un démonstrateur avancé : données et déplacements simulés, même lorsque la géométrie des rues est réelle.',sources:['README.md','docs/IMPLEMENTATION-STATUS.md']}];

const add=(title,items,notes,sources,caption)=>slides.push({title,items,notes,sources,caption});
const table=(title,rows,notes,sources,caption,columns)=>slides.push({title,rows,notes,sources,caption,columns});

add('Le problème traité',[
 ['Décider comment répartir les livraisons','Comparer une tournée partagée, des véhicules séparés et une affectation hybride.'],
 ['Comprendre chaque décision','Relier le résultat aux agents, aux outils, aux contraintes et au certificat indépendant.'],
 ['Maîtriser les appels aux modèles','Voir les tokens et coûts par appel, agent, modèle et ensemble des opérations.']
], 'Le besoin commercial est une aide à la répartition de livraisons et à la compréhension des décisions. Genesis permet de préparer plusieurs enlèvements et dépôts, puis de comparer des affectations. Le périmètre livré est une application locale avec preuves et simulations. La réduction de kilomètres, de retards ou de coûts constitue un objectif à mesurer sur des données représentatives; aucune économie client ni rentabilité SaaS n’est démontrée ici. La qualité de la décision dépend notamment des fenêtres, capacités, positions initiales et données routières fournies.', ['docs/LOGISTICS-SPEC.md','docs/DISPATCH.md','docs/TRANSPORT-CHECKLIST.md']);

table('Ce qui est réel, simulé ou à construire',[
 ['Implémenté','API, worker durable, solveur, certificats, budget et interface locale.'],
 ['Données routières réelles','Adresses et routes issues de services cartographiques externes.'],
 ['Simulé','Positions des véhicules, livraisons et temps de parcours exécutés.'],
 ['À construire pour les clients','Identité, GPS, acceptation conducteur, preuve de livraison et exploitation.']
], 'Une carte réelle ne transforme pas la simulation en transport réel. Les géométries OpenStreetMap/OSRM et les permis de travaux municipaux sont des sources externes; les mouvements et événements de livraison sont produits par le simulateur. Les vérifications historiques du profil local sont documentées. PostgreSQL, télémétrie cloud et exigences de service commercial doivent être testés avant toute promesse client. Le statut des prix, modèles, configurations privées et fournisseurs doit être revalidé à chaque nouvelle installation.', ['README.md','docs/IMPLEMENTATION-STATUS.md','docs/TRANSPORT-CHECKLIST.md']);

table('Trois espaces de travail',[
 ['Opérations','Saisir les adresses, préparer les livraisons et suivre les trajets simulés.'],
 ['Analytique','Lire les agrégats, le budget global, les graphiques et exporter le CSV.'],
 ['Agents','Inspecter les appels, résultats, historiques, comparaisons et preuves.']
], 'La navigation U14 regroupe les anciens écrans au lieu de répéter les mêmes indicateurs dans sept destinations principales. Les vues overview, fleet, runs, compare et observatory restent des projections d’exécution dans le sélecteur Dossier des agents. Les liens historiques gardent leur vue, leurs identifiants et leurs filtres. La page par défaut et le logo conduisent aux opérations. Les données globales et le suivi du courriel de budget sont centralisés dans Analytique; les détails d’un appel restent dans Agents. La nouvelle disposition n’a pas encore sa validation visuelle MCP complète.', ['apps/web/src/WorkspaceControls.tsx','apps/web/src/App.tsx','apps/web/src/state.ts','docs/work/U14-interface.md']);

table('Architecture du profil local',[
 ['Navigateur · port 5173','React / TypeScript : interface, filtres, carte, graphes et appels HTTP.'],
 ['API · port 8000','FastAPI / Uvicorn : contrats, lecture, validation et mise en file.'],
 ['Worker Python','Réclame les tâches, exécute le graphe et conserve ses preuves.'],
 ['Persistance locale','SQLite via SQLAlchemy + checkpoints LangGraph dans SQLite.'],
 ['Services externes','Anthropic, géocodage, routes, tuiles; SMTP et Langfuse selon configuration.']
], 'scripts/start.ps1 démarre trois processus indépendants: le serveur Vite, l’API Uvicorn et le worker. L’interface ne détient pas la clé du modèle et n’exécute pas le solveur. Elle interroge l’API, qui persiste la demande avant de laisser le worker la traiter. Cette séparation permet de recharger le navigateur sans perdre le dossier. Les transactions et revendications de tâches restent le mécanisme de coordination du profil local. Les checkpoints conservent la progression du graphe, tandis que les tables métier et événements restent la référence observable.', ['scripts/start.ps1','services/genesis/api.py','services/genesis/worker.py','services/genesis/db.py','services/genesis/workflow.py']);

table('Organisation du dépôt',[
 ['apps/web','Composants React, styles, types, state URL et tests Vitest.'],
 ['services/genesis','API, orchestration, solveurs, validation, stockage et fournisseurs.'],
 ['tests / qa','Tests Python isolés et parcours navigateur avec Playwright / axe.'],
 ['config / packages/contracts','Tarifs versionnés et contrat OpenAPI exporté.'],
 ['docs / experiments','Spécifications, décisions, actions, revues et preuves expérimentales.']
], 'Cette organisation relie chaque fonctionnalité à un contrat et à ses preuves. Le frontend contient des projections de données, tandis que les contraintes du transport et l’autorité financière sont côté serveur. Les scénarios de benchmark et leurs manifestes sont séparés des opérations de courtage. Les secrets restent hors Git. Les sources de cette présentation sont publiques dans le dépôt; aucune valeur de configuration privée n’a été copiée. Les liens de notes correspondent à la révision U14 4c8dd4c et au dossier technique créé le 11 octobre 2026.', ['README.md','AGENTS.md','docs/DATA-CONTRACT.md']);

add('React et TypeScript',[
 ['Pourquoi React','Composer les écrans à partir de composants spécialisés et synchroniser leurs sélections.'],
 ['Comment l’état circule','Les filtres et identifiants vivent dans l’URL; les réponses alimentent les vues locales.'],
 ['Pourquoi TypeScript','Vérifier les contrats côté interface, les valeurs nulles et les propriétés des composants.']
], 'React 19.2.0 et React DOM rendent une application à page unique. App.tsx coordonne la sélection d’exécution, les filtres et les vues; Analytics, Dispatch, Metering et OverallCost possèdent leurs projections. state.ts lit et écrit les paramètres URL. Les actions de navigation créent un historique, tandis que les saisies de recherche remplacent l’entrée courante pour éviter une entrée par caractère. Les requêtes restent validées côté Python: les types TypeScript ne protègent pas à eux seuls une frontière réseau. Les composants natifs conservent des noms accessibles et la navigation clavier.', ['apps/web/package.json','apps/web/src/App.tsx','apps/web/src/state.ts','apps/web/src/types.ts','https://react.dev/learn']);

table('Bibliothèques de visualisation',[
 ['ECharts 6.1.0','Donuts, barres, séries et distributions; tableaux accessibles en complément.'],
 ['React Flow 12.10.0','Graphe des rôles, invocations et transmissions observées.'],
 ['MapLibre GL 6.13.0','Rendu de la carte, lignes de routes, arrêts et véhicules simulés.'],
 ['Lucide + Inter Variable','Icônes cohérentes et police servie localement avec l’application.']
], 'ECharts est chargé avec des composants de graphique explicitement enregistrés et un rendu SVG. React Flow, via @xyflow/react, fournit le canevas interactif du graphe d’agents; il ne dirige pas l’exécution backend. MapLibre affiche la cartographie et les marqueurs mais ne calcule pas lui-même l’itinéraire. lucide-react évite un ensemble hétérogène d’icônes et @fontsource-variable/inter évite un appel distant pour la police. Ces quatre responsabilités sont distinctes; aucune de ces bibliothèques n’est un modèle d’IA ni un moteur de contraintes.', ['apps/web/src/Chart.tsx','apps/web/src/Observability.tsx','apps/web/src/DispatchMap.tsx','apps/web/src/main.tsx','https://echarts.apache.org/en/index.html','https://reactflow.dev/learn','https://maplibre.org/maplibre-gl-js/docs/']);

add('Vite, build et développement',[
 ['Vite + plugin React','Démarrer le serveur local et actualiser les composants pendant le développement.'],
 ['TypeScript puis bundle','npm run build exécute tsc -b, puis produit les fichiers statiques avec Vite.'],
 ['Chargement des visualisations','Découpage des dépendances; les blocs cartographie et graphiques restent volumineux.']
], 'Vite 7.3.7, @vitejs/plugin-react 5.1.4 et TypeScript 5.9.3 constituent la chaîne de build. Les types React et React DOM sont des dépendances de développement. Le composant Dispatch est chargé à la demande avec React.lazy et Suspense. Des blocs séparés isolent les principaux fournisseurs graphiques, mais les avertissements supérieurs à 500 kB persistent. Cela justifie un profil de performance réel avant un déploiement sur connexion mobile. Prettier 3.9.10 est déclaré comme formateur du projet; il ne prouve ni la correction fonctionnelle ni l’accessibilité.', ['apps/web/package.json','apps/web/vite.config.ts','apps/web/src/App.tsx','docs/work/U14-interface.md']);

add('FastAPI, Pydantic et Uvicorn',[
 ['FastAPI expose les opérations','Lire les exécutions, préparer un plan, suivre ses événements et inspecter les coûts.'],
 ['Pydantic valide les frontières','Contrôler types, limites, identifiants et sorties structurées avant leur utilisation.'],
 ['Uvicorn sert le processus API','L’API locale s’exécute séparément des tâches longues du worker.']
], 'FastAPI 0.143.0 définit les routes HTTP et s’appuie sur les modèles Pydantic 2.14.0. Uvicorn 0.54.0 sert l’application ASGI. Les modèles déclarent des contraintes telles que le nombre de livraisons ou de véhicules et structurent le contrat OpenAPI. packages/contracts/openapi.json provient du schéma exécutable, mais cela ne signifie pas que tous les types frontend sont automatiquement générés. Une erreur de validation n’autorise jamais le modèle à modifier les capacités ou les règles du transport. Les tâches coûteuses restent dans le worker plutôt que dans une requête HTTP longue.', ['services/genesis/api.py','services/genesis/broker_api.py','services/genesis/models.py','packages/contracts/openapi.json','https://fastapi.tiangolo.com/']);

table('Les objets persistés',[
 ['Exécution et invocation','Demande, statut, rôle, chronologie, parenté et résultat final.'],
 ['Événement et artefact','Fait observé ordonné et preuve structurée consultable.'],
 ['Tentative et réservation','Modèle, tokens, charge estimée et exposition financière encore retenue.'],
 ['Plan et trajet','Affectation des véhicules, arrêts, géométrie et progression simulée.'],
 ['Alerte de budget','Un événement logique durable et son état de remise SMTP.']
], 'La base sépare les concepts qui pourraient sinon être confondus. Un rôle peut avoir un résultat déterministe sans appel fournisseur. Une tentative peut échouer tout en conservant un coût connu, ou rester financièrement incertaine. Un plan analysé peut produire un diagnostic accepté sans trajet dispatchable. Un événement alimente la lecture chronologique; un artefact contient le résultat détaillé. Les réservations financières et de véhicules répondent à des contraintes différentes. Le schéma et les projections de lecture rendent ces distinctions explicites dans l’interface.', ['services/genesis/db.py','docs/DATA-CONTRACT.md','services/genesis/telemetry.py','services/genesis/api.py']);

add('SQLAlchemy et SQLite',[
 ['Pourquoi une base transactionnelle','Enregistrer ensemble les changements qui doivent rester cohérents.'],
 ['Comment SQLAlchemy est utilisé','Définir les tables, lire les projections et encadrer les écritures par transaction.'],
 ['Pourquoi SQLite dans ce profil','Fournir un environnement local reproductible sans serveur de base externe.']
], 'SQLAlchemy 2.1.4 est la couche SQL utilisée par le store. La configuration par défaut est sqlite:///data/genesis.db. Les opérations sensibles utilisent des transactions afin de coordonner états, réservations et preuves. Le worker utilise aussi des revendications avec propriétaire et génération: le seul fait de lancer deux processus ne doit pas autoriser deux exécutions de la même tâche. SQLite convient au profil local vérifié; le projet ne dispose pas encore des preuves de charge, sauvegarde/restauration et isolation multi-tenant exigées pour une flotte cliente. PostgreSQL est un profil configurable distinct, non validé ici.', ['services/genesis/db.py','services/genesis/worker.py','docs/IMPLEMENTATION-STATUS.md']);

add('Worker durable et reprise',[
 ['Réclamer une tâche','Le worker prend un bail avec propriétaire et génération, puis renouvelle ce bail.'],
 ['Conserver l’avancement','Résultats de rôles, événements et checkpoints permettent une reprise contrôlée.'],
 ['Éviter les doublons coûteux','Une tentative fournisseur non résolue bloque une nouvelle émission automatique.']
], 'Le worker est un processus Python dédié. Une génération sert de barrière: un ancien worker qui revient tard ne doit pas publier comme s’il possédait encore la tâche. La reprise n’est pas une garantie universelle de exactement une fois. Elle s’appuie sur la persistance des résultats et sur les règles financières de non-réémission quand une facturation est incertaine. L’annulation est observable et ne signifie pas qu’un appel déjà reçu par le fournisseur ne coûtera rien. Les trajets prêts appartenant à un plan annulé ou échoué sont retirés suivant les règles d’admission.', ['services/genesis/worker.py','services/genesis/workflow.py','services/genesis/db.py','docs/DATA-CONTRACT.md']);

add('LangGraph et la chaîne des rôles',[
 ['Planification → trafic → optimisation','Construire le problème, obtenir la matrice routière et comparer les affectations.'],
 ['Surveillance → exception → finalisation','Vérifier indépendamment, produire un diagnostic et tenter l’admission des trajets.'],
 ['Checkpoints SQLite','Conserver l’état du graphe pour suivre et reprendre une exécution.']
], 'LangGraph 1.2.14 encode le graphe de contrôle. Ce graphe est séquentiel dans l’implémentation actuelle; cinq agents ne signifient pas cinq modèles autonomes travaillant simultanément. SqliteSaver, fourni par langgraph-checkpoint-sqlite 3.1.1, persiste ses checkpoints. La bibliothèque fournit un cadre de graphe avec état; Genesis ajoute ses propres transactions, événements, clôtures de bail et politiques budgétaires. Le graphe du navigateur est une visualisation React Flow de cette activité, pas le moteur LangGraph. Un agent exécute d’abord son opération déterministe puis, si la politique l’autorise, demande une explication au modèle.', ['services/genesis/workflow.py','services/genesis/broker_runtime.py','https://docs.langchain.com/oss/python/langgraph/overview']);

table('Les cinq agents : responsabilité et preuve',[
 ['Planification','Fige demandes, capacités et origines; prépare les contraintes et le contexte.'],
 ['Trafic','Obtient la matrice routière statique ou la perturbation du benchmark.'],
 ['Optimisation','Évalue les stratégies avec un solveur déterministe borné.'],
 ['Surveillance','Contrôle le résultat indépendamment et enregistre un certificat.'],
 ['Exception','Détermine si le résultat peut être admis ou exige un diagnostic.']
], 'Chaque rôle laisse un résultat et des références de preuves. Le nom Trafic désigne une responsabilité de données de trajet, pas une capacité actuelle de prévision du trafic réel. Surveillance ne confie pas la validité du plan à une appréciation textuelle: la vérification déterministe reste l’autorité. Exception n’improvise pas une réaffectation de cargaison réelle. Les règles actuelles décident entre résultat admissible et diagnostic. Cette séparation permet d’inspecter précisément où une demande échoue sans inventer un itinéraire pour masquer l’échec.', ['services/genesis/broker_runtime.py','services/genesis/workflow.py','docs/LOGISTICS-SPEC.md']);

add('Demande de livraison : entrée et admission',[
 ['Valider la demande','1 à 10 livraisons et 1 à 4 véhicules; adresses, identifiants et contraintes contrôlés.'],
 ['Persister puis traiter','Une clé d’idempotence évite de créer un second plan incompatible lors d’une répétition.'],
 ['Revalider avant de créer les trajets','Une flotte occupée ou une route devenue incompatible peut refuser l’admission finale.']
], 'POST /api/v1/dispatch/plans valide la requête, vérifie une disponibilité initiale de flotte et fige la sélection des modèles pour une exécution live. Une prévalidation ne remplace pas le contrôle final: un autre plan peut utiliser un véhicule entre-temps. L’optimisation doit donc être suivie d’une admission transactionnelle. Un plan analysé peut terminer avec accepted_diagnostic sans trajets prêts. Cette distinction doit rester visible dans une démonstration commerciale, car une explication réussie n’équivaut pas à un camion réellement affecté.', ['services/genesis/broker_api.py','services/genesis/broker_runtime.py','services/genesis/dispatch.py']);

table('Adresses, routes et affichage',[
 ['Photon','Transformer une recherche d’adresse en candidats géographiques sélectionnables.'],
 ['OSRM','Fournir matrice dirigée, distances, durées statiques et géométrie routière.'],
 ['OpenFreeMap / OpenStreetMap','Fournir le fond de carte et les données cartographiques associées.'],
 ['MapLibre GL','Afficher ces données et relier marqueur, arrêt sélectionné et fiche de trajet.'],
 ['HTTPX','Appeler les fournisseurs depuis le serveur avec contrôle des réponses et erreurs.']
], 'Le fournisseur de géocodage identifie les lieux; le moteur de route calcule un chemin; MapLibre dessine la carte. Ces fonctions ne sont pas interchangeables. Les services keyless évitent une clé Google Maps pour la démonstration, mais ne constituent pas un engagement contractuel de débit ou disponibilité. Les durées OSRM sont statiques et ne prouvent pas une prise en compte du trafic instantané. Les données municipales de travaux sont timestampées et affichables; elles ne deviennent pas automatiquement des interdictions de parcours. Des services adaptés aux poids lourds restent nécessaires pour une exploitation de transport général.', ['services/genesis/dispatch.py','services/genesis/traffic.py','apps/web/src/DispatchMap.tsx','docs/DISPATCH.md']);

add('OR-Tools et les contraintes de transport',[
 ['Construire un problème de tournées','Transformer livraisons, véhicules, capacités et fenêtres en variables et contraintes.'],
 ['Explorer des solutions admissibles','Limiter le temps de recherche et comparer les candidats selon l’objectif configuré.'],
 ['Qualifier honnêtement le résultat','Meilleur candidat trouvé dans la recherche; aucune promesse d’optimum global.']
], 'OR-Tools 9.15.6755 est le moteur de recherche combinatoire. Les déplacements proviennent de la matrice de données; les contraintes portent sur les visites, le temps, la capacité et les règles de pickup/drop-off. Une limite de recherche permet de garder un délai exploitable. Un timeout ne prouve pas que le problème est infaisable, et un bon candidat ne prouve pas qu’il est optimal. L’application calcule et conserve les métriques nécessaires à la comparaison. Un validateur séparé recalculera ensuite la faisabilité du candidat.', ['services/genesis/solver.py','services/genesis/broker_solver.py','docs/LOGISTICS-SPEC.md','https://developers.google.com/optimization/routing/vrp']);

table('Un véhicule ou plusieurs',[
 ['Tournée partagée','Regrouper plusieurs livraisons; comparer service, durée et coût sous contraintes.'],
 ['Affectation séparée','Répartir les livraisons; accepter davantage de véhicules si l’objectif le justifie.'],
 ['Solution hybride','Combiner regroupements et véhicules dédiés selon le meilleur candidat faisable.'],
 ['Décision finale','Comparer les stratégies valides; recontrôler la flotte et les routes à l’admission.']
], 'L’utilisateur souhaite une logique de courtier: affecter un même conducteur à plusieurs livraisons ou séparer les missions lorsque cela améliore l’objectif. Le backend évalue des stratégies candidates dans le cadre de la flotte et des contraintes fournies. La réponse ne se réduit pas à demander au modèle quelle tournée il préfère. L’objectif métier et la faisabilité déterminent les compromis. Un regroupement peut économiser des kilomètres mais dégrader la ponctualité; une affectation séparée peut augmenter le coût des véhicules. Les résultats doivent toujours être comparés sur un périmètre et des unités identiques.', ['services/genesis/broker_solver.py','services/genesis/broker_runtime.py','docs/DISPATCH.md','docs/LOGISTICS-SPEC.md']);

add('Le certificat indépendant',[
 ['Recalculer les contraintes','Contrôler visites, séquence enlèvement/dépôt, capacités et temps.'],
 ['Conserver un résultat explicite','Associer validité, violations éventuelles et preuves au plan évalué.'],
 ['Respecter le périmètre certifié','Un suffixe replanifié ne certifie pas rétroactivement toute la journée.']
], 'Le certificat constitue une vérification indépendante du candidat produit par le solveur. Le benchmark distingue plan initial, simulation de journée et éventuel suffixe résiduel replanifié. Un certificat valide signifie que le candidat respecte les contraintes représentées dans ce problème; il ne garantit pas l’exactitude des données d’entrée, le trafic réel ou le comportement du conducteur. Les modèles ne peuvent pas annuler une violation. Dans le courtage, l’admission finale peut encore refuser des trajets même après la validation mathématique, par exemple si un véhicule n’est plus disponible.', ['services/genesis/solver.py','services/genesis/broker_solver.py','docs/LOGISTICS-SPEC.md','docs/DATA-CONTRACT.md']);

add('Anthropic : des explications bornées',[
 ['Une seule famille de fournisseur live','Le runtime utilise Anthropic; aucun fallback OpenAI n’est exécuté.'],
 ['Une sortie structurée','Le modèle rend summary et evidence_refs; le schéma et les références sont contrôlés.'],
 ['Une autorité limitée','Le modèle explique les preuves; il ne modifie pas les contraintes ou les réservations.']
], 'Le SDK Anthropic 1.13.0 est instancié à la demande pour les exécutions live. L’appel reçoit un contexte borné d’artefacts et doit renvoyer un objet conforme. Le backend vérifie que les références désignent des éléments réellement fournis. Une réponse invalide ne devient pas un résultat métier, même si des tokens ont été facturés. Les tentatives historiques OpenAI restent des données de comptabilité et de diagnostic: elles ne réactivent pas ce fournisseur. La clé et les identifiants réellement configurés ne sont pas exposés dans cette présentation.', ['services/genesis/llm.py','services/genesis/workflow.py','docs/BUDGET.md']);

table('Modèles par complexité de rôle',[
 ['Planification / optimisation','Famille Sonnet · raisonnement explicatif sur contraintes et stratégies.'],
 ['Trafic / exception','Famille Haiku · explications bornées des données ou diagnostics.'],
 ['Surveillance','Famille Opus · synthèse des preuves et limites du résultat.'],
 ['Validation avant appel','Identifiant configuré + clé + tarif valide; pas de substitution silencieuse.']
], 'Le dépôt documente des profils Claude Haiku 5.5, Sonnet 5.5 et Opus 5.5 et contient leurs entrées tarifaires. Ils représentent une configuration de projet, pas une affirmation sur les modèles actuellement disponibles dans un compte. llm.py exige les variables de modèle et les tarifs; il ne remplace pas automatiquement un modèle indisponible. Les tarifs versionnés examinés expirent le 17 octobre 2026. Ils doivent être revérifiés avant d’autres appels après cette date. Une famille plus puissante n’obtient aucun droit supplémentaire sur les contraintes, le budget ou le certificat.', ['docs/BUDGET.md','config/anthropic-prices.json','services/genesis/llm.py'], 'Profils documentés du dépôt; disponibilité et configuration privées non inspectées.');

table('Cinq rôles ne signifient pas cinq appels',[
 ['Fixture','Aucun appel au modèle; outils et preuves déterministes.'],
 ['Live · always','Cinq explications dans une exécution normale complète.'],
 ['Live · routine sans réemploi','Planification et trafic sans explication; trois appels restants.'],
 ['Routine avec réemploi revalidé','Les cinq explications sont omises; les outils continuent de fonctionner.']
], 'La politique par défaut de l’API est always, tandis que l’interface documente la politique routine pour économiser les appels. Une omission produit un événement model.omitted et une raison observable. Elle ne crée ni tentative fournisseur ni réservation budgétaire. Un rôle peut donc réussir sans tokens déclarés, avec une catégorie de non-applicabilité distincte d’une réponse fournisseur inconnue. Les nombres 5, 3 et 0 décrivent une exécution normale selon la politique: annulations, erreurs et retries peuvent changer le nombre effectif de tentatives. Le cache de tokens du fournisseur est un mécanisme séparé.', ['services/genesis/broker_api.py','services/genesis/broker_runtime.py','docs/ROUTE-MEMORY.md']);

add('Mémoire des trajets usuels',[
 ['Retrouver les missions comparables','Lire l’historique borné de trajets et identifier les missions entièrement terminées.'],
 ['Rejouer les contraintes actuelles','Reconstruire l’ancien ordre de visites, le certifier et le comparer à la sélection actuelle.'],
 ['Économiser des explications','Omettre les appels seulement si le contexte réutilisé reste compatible et validé.']
], 'La mémoire utilise dispatch_trips comme historique autoritaire; elle n’entraîne pas un nouveau modèle et n’est pas une base vectorielle de suggestions libres. La lecture porte sur les 500 trajets les plus récents et au plus trois candidats de courtage classés. Une mission réutilisable exige ses trajets complets, un plan accepté et réussi, une correspondance du travail et de la politique, des preuves routières et une provenance cohérente. Une ambiguïté entre livraisons identiques empêche de conclure que l’ordre est réutilisable. Le solveur, les routes, le certificat et l’admission finale restent exécutés.', ['services/genesis/route_memory.py','services/genesis/broker_runtime.py','docs/ROUTE-MEMORY.md']);

table('Ce que la mémoire mesure vraiment',[
 ['Distance de mission','Somme de la distance simulée des véhicules de la mission.'],
 ['Temps de mission','Durée jusqu’à la fin du dernier véhicule : makespan simulé.'],
 ['Cadence','Livraisons terminées par heure de simulation; pas de productivité GPS.'],
 ['Limite de comparaison','Origines, contraintes et véhicules différents peuvent fausser un classement naïf.']
], 'Les indicateurs d’historique doivent conserver leur unité d’échantillon: un trajet n’est pas une mission multi-véhicules. Les métriques de contexte du courtier s’appuient sur la mission complète. Les accélérations de simulation ne doivent jamais être interprétées comme des durées de travail réelles. La réutilisation peut éviter une explication tout en échouant ensuite à l’admission; selection_outcome et admission_outcome restent séparés. Il ne faut donc pas vendre cette mémoire comme une preuve d’apprentissage des embouteillages ou de performance réelle des conducteurs.', ['services/genesis/route_memory.py','docs/ROUTE-MEMORY.md','docs/DATA-CONTRACT.md']);

add('Mesure de chaque appel',[
 ['Tentative fournisseur','Associer rôle, modèle, statut, latence et référence de requête.'],
 ['Usage déclaré','Conserver entrée, sortie et catégories de cache facturables lorsqu’elles sont connues.'],
 ['Agrégats consultables','Additionner les charges connues tout en signalant les réservations et données absentes.']
], 'Les coûts API sont calculés avec des valeurs décimales et des tarifs versionnés en USD. Les entrées, sorties et catégories de cache peuvent avoir des prix différents. Une donnée manquante reste indisponible; elle ne devient pas zéro. Les coûts par rôle ou modèle sont des projections de tentatives, et les totaux du projet restent indépendants des filtres de cohorte. Les coûts de flotte simulés et les charges du fournisseur d’IA sont deux métriques différentes. Un échec de sortie structurée conserve le coût connu de la tentative au lieu d’effacer la dépense.', ['services/genesis/llm.py','services/genesis/db.py','apps/web/src/Metering.tsx','apps/web/src/OverallCost.tsx','docs/BUDGET.md']);

add('Plafond partagé de C$100',[
 ['Réserver avant l’appel','Borne d’entrée prudente + sortie maximale, sous limites de run et de projet.'],
 ['Régler avec l’usage connu','Enregistrer la charge estimée et libérer la partie de réserve qui n’est plus nécessaire.'],
 ['Bloquer les nouvelles dépenses','Le connu + le retenu doit rester admissible; un dépassement constaté gèle les appels.']
], 'Le plafond persistant autorisé est de 100 dollars canadiens pour les appels de modèles, partagé entre exécutions, retries et vérifications. Le profil documenté valorise prudemment un dollar USD à deux dollars CAD; 100 CAD correspondent alors à 50 USD d’exposition permise. Ce coefficient est une politique de sécurité, pas un taux de change de marché ni une facture. Les réservations concernent le connu et l’exposition encore incertaine. Une alerte de budget n’autorise aucun dépassement et ne remet pas le plafond à zéro. Le coût des fournisseurs cartographiques ou d’hébergement futurs nécessiterait un suivi séparé.', ['services/genesis/db.py','services/genesis/llm.py','docs/BUDGET.md','config/anthropic-prices.json']);

table('Erreurs et facturation incertaine',[
 ['Rate limit explicitement rejeté','Retry borné; jusqu’à trois tentatives selon la politique actuelle.'],
 ['Usage connu, sortie invalide','Conserver la charge; refuser le résultat métier non conforme.'],
 ['Réponse ambiguë ou usage absent','Garder la réserve et interdire la réémission automatique.'],
 ['Charge au-delà de la réserve','Persister la charge connue et geler les nouveaux appels.']
], 'Une erreur réseau ne démontre pas que le fournisseur n’a rien reçu. C’est pourquoi une tentative incertaine reste financièrement retenue et ne doit pas être relancée automatiquement. Seul un rejet explicite de limitation de débit suit le retry prévu. Le worker expose actuellement BillingUncertain sous budget_exceeded avec un indicateur distinct d’incertitude; l’interface doit donc montrer le diagnostic détaillé, pas interpréter le seul statut comme une preuve de consommation du plafond. Ces mécanismes privilégient la visibilité de l’exposition plutôt qu’un total artificiellement bas.', ['services/genesis/llm.py','services/genesis/worker.py','services/genesis/db.py','docs/BUDGET.md']);

add('Courriel lorsque le budget bloque',[
 ['Déclenchement durable','Une alerte logique pour épuisement, refus global de réservation ou gel du projet.'],
 ['Envoi séparé','Le worker SMTP travaille hors transaction de budget, avec TLS et une revendication durable.'],
 ['État honnête','Accepté par SMTP ne prouve pas la réception; un envoi incertain n’est pas répété.']
], 'Le service notifications utilise smtplib, ssl et email de la bibliothèque standard Python, avec des paramètres privés. Une limite propre à une seule exécution n’est pas le même événement qu’un blocage du budget global. Les échecs connus avant DATA peuvent être réessayés après 30 puis 60 secondes, au maximum trois tentatives. Une réponse DATA explicitement rejetée termine en échec; un résultat DATA ambigu ou un bail d’envoi expiré termine en uncertain. Un Message-ID stable ne garantit pas exactement une fois. Le compte Gmail a passé TLS/authentification; aucun message externe de test n’a été envoyé.', ['services/genesis/notifications.py','docs/BUDGET-EMAIL.md','apps/web/src/BudgetAlertStatus.tsx','docs/IMPLEMENTATION-STATUS.md']);

add('Deux horloges et une carte inspectable',[
 ['Horloge des agents','Mesurer le temps réel d’exécution et reconstruire la chronologie des preuves.'],
 ['Horloge de livraison','Rejouer l’avancement simulé des véhicules sur la géométrie routière.'],
 ['Sélection liée','Un arrêt relie ligne du planning, marqueur et paire enlèvement/dépôt.']
], 'Le replay masque les résultats qui n’existaient pas encore à l’événement sélectionné. Les temps de simulation et les latences de modèle sont distincts; comparer l’un à l’autre produirait un indicateur faux. La carte U14 conserve des éléments de marqueur stables pour éviter de perdre la sélection lors du polling et ne recadre pas continuellement le même arrêt. Les contraintes indisponibles restent signalées. Le suivi à l’écran reste une simulation; il n’utilise pas de GPS conducteur. Le nouveau comportement de focus et de carte requiert encore sa vérification navigateur finale.', ['apps/web/src/Replay.tsx','apps/web/src/replayState.ts','apps/web/src/Dispatch.tsx','apps/web/src/DispatchMap.tsx','docs/work/U14-dispatch.md']);

add('Analytique et export CSV',[
 ['Lire les dénominateurs','Distinguer cohorte d’exécutions, appels au modèle et total financier du projet.'],
 ['Montrer la fraîcheur et les absences','Conserver un ancien résultat identifié comme tel; ne pas remplacer un null par zéro.'],
 ['Exporter le périmètre visible','CSV local avec filtres, unités, horodatages, couverture et protection contre les formules.']
], 'Analytics charge des projections agrégées et sépare les snapshots par requête. L’export reste désactivé sans snapshot correspondant au filtre courant; un ancien snapshot de la même requête peut être exporté avec son état stale. Les caractères pouvant déclencher une formule de tableur sont neutralisés dans les chaînes. Le CSV ne contient ni adresses, ni sorties complètes de modèles, ni secrets. Les données de trois endpoints ne forment pas un instantané transactionnel unique. Les inventaires bornés aux 200 lignes les plus récentes ne doivent pas être présentés comme des totaux exhaustifs.', ['apps/web/src/Analytics.tsx','apps/web/src/analyticsExport.ts','apps/web/src/OverallCost.tsx','docs/work/U14-analytics.md']);

table('Intégrations facultatives et installation seule',[
 ['Langfuse','Export secondaire via outbox lorsque configuré; la base locale reste la référence.'],
 ['PostgreSQL / Psycopg','Profil configurable et packages installés; exploitation non validée ici.'],
 ['Alembic','Installé; aucun environnement de migrations métier actif identifié.'],
 ['NumPy / Pandas / sqlite-vec','Présents dans les dépendances; aucune fonction métier directe démontrée.'],
 ['OpenTelemetry / LangSmith','Packages de l’écosystème; ne prouvent pas une télémétrie produit activée.']
], 'Cette distinction évite de transformer une longue liste de paquets en promesse de fonctionnalités. Certains paquets sont requis par des bibliothèques de plus haut niveau; d’autres relèvent d’un profil optionnel ou d’un reste de développement. langgraph-checkpoint-postgres est installé, mais le workflow courant importe SqliteSaver. L’outbox Langfuse est réellement prévue dans le worker mais son fonctionnement cloud n’est pas validé par le profil local. L’annexe donne chaque paquet Python épinglé et les dépendances directes JavaScript. Les lockfiles npm contiennent en complément leur arbre transitif complet.', ['requirements.txt','services/genesis/worker.py','services/genesis/workflow.py','compose.yaml','docs/IMPLEMENTATION-STATUS.md']);

table('Tests et outils de qualité',[
 ['pytest + Ruff','Tests de contraintes, budget, reprise, mémoire et alertes; analyse statique Python.'],
 ['Vitest + TypeScript','Tests de logique et de rendu statique; vérification des types frontend.'],
 ['Playwright + axe-core','Parcours navigateur et audits automatisés d’accessibilité.'],
 ['GitHub Actions','Installation reproductible, tests, lint, build et profil déterministe CI.']
], 'La configuration CI épingle les actions et utilise Python 3.13 et Node 24. Elle installe les requirements et les lockfiles npm, exécute les tests Python et frontend puis prépare un profil déterministe pour les parcours navigateur. Les tests fournisseurs peuvent utiliser des réponses enregistrées ou mocks: cela protège les coûts mais ne certifie pas la disponibilité des services publics. U14 a passé 60 tests frontend, un build TypeScript/Vite et huit tests API isolés. Ces résultats sont une preuve ciblée, pas un nouveau passage de toute la suite Python ou un certificat WCAG.', ['.github/workflows/verify.yml','pyproject.toml','apps/web/package.json','qa/package.json','docs/work/U14-interface.md']);

add('Preuves et limites de validation',[
 ['Benchmark historique','20 exécutions Anthropic acceptées, 100 appels; politiques et graines appariées.'],
 ['Interface U14','60 tests frontend et build réussis; revue indépendante du code approuvée.'],
 ['Vérification navigateur encore ouverte','Serveur web restauré; MCP reste bloqué sur une page d’erreur data: en attente de rechargement.']
], 'Les vingt exécutions historiques correspondent aux cinq scénarios S01–S05, deux politiques logistiques et deux graines 17/29. Le manifeste live enregistre les identifiants et preuves; il ne doit pas être mélangé avec les fixtures. Le total API estimé du benchmark documenté est 0,6696181 USD, et n’est pas le total de toutes les opérations du projet. La revue U14 approuve une portée de source précise; elle n’approuve pas une nouvelle apparence vue dans le navigateur. Les avertissements de taille de bundle restent présents. Les anciens tests de capture ne constituent pas une capture de la nouvelle navigation.', ['experiments/live-manifest.json','docs/IMPLEMENTATION-STATUS.md','docs/reviews/interface-review.md','docs/work/U14-interface.md'], 'Résultats historiques et vérifications ciblées; aucune certification de service commercial.');

add('Démonstration du workflow',[
 ['Préparer un scénario sûr','Choisir plusieurs adresses, une flotte disponible et la démonstration sans appel IA.'],
 ['Inspecter le plan proposé','Comparer affectations, vérifier certificat et résultat d’admission avant simulation.'],
 ['Expliquer les preuves','Ouvrir Agents, puis Analytique pour montrer appels, omissions, coûts et export.']
], 'Ce déroulé présente la chaîne fonctionnelle sans créer de coût modèle. La démonstration doit annoncer la simulation dès le départ. Elle peut montrer qu’un même véhicule dessert plusieurs arrêts et que les alternatives ont un coût ou une durée différente. Avant de simuler, vérifier que des trajets ont réellement été admis et que les véhicules sont disponibles. Pour illustrer la mémoire, utiliser une mission déjà terminée et strictement compatible; ne pas promettre un hit à chaque répétition d’adresse. Le passage en live exige disponibilité du modèle, tarif valide, clé privée et budget résiduel.', ['docs/DISPATCH.md','docs/ROUTE-MEMORY.md','apps/web/src/Dispatch.tsx']);

table('Conditions avant une utilisation cliente',[
 ['Identité et isolation','Authentifier utilisateurs et conducteurs; isoler les données de chaque entreprise.'],
 ['Exécution terrain','GPS, acceptation de mission, preuve de livraison et gestion réelle de la cargaison.'],
 ['Données de transport','Fournisseurs contractuels, trafic et restrictions adaptées aux véhicules.'],
 ['Exploitation','Sauvegarde/restauration, supervision, charge, concurrence et disponibilité mesurées.'],
 ['Validation métier','Tests avec répartiteurs et données représentatives; bénéfices et erreurs mesurés.']
], 'L’ordre de livraison recommandé est de sécuriser identité et séparation des entreprises, puis de fermer la boucle conducteur et les preuves opérationnelles, avant d’augmenter la complexité de l’IA. La mémoire de routes ne compense ni une mauvaise position de départ ni des restrictions poids lourds absentes. Le plafond modèle n’est pas un contrôle de toutes les dépenses d’une entreprise. Le plan de test doit inclure délais fournisseur, interruption du worker, double soumission, donnée périmée et reprise avec cargaison. Les critères de libération sont définis dans TRANSPORT-CHECKLIST; aucun de ces points n’est clos par l’apparence du tableau de bord.', ['docs/TRANSPORT-CHECKLIST.md','docs/IMPLEMENTATION-STATUS.md']);

add('Arbitrages d’architecture',[
 ['Ajouter une IA ne remplace pas un solveur','Conserver les décisions de faisabilité et d’argent dans des règles testables.'],
 ['Réduire les appels avant de multiplier les modèles','Utiliser contexte validé et politiques explicites; mesurer coût et utilité des explications.'],
 ['Industrialiser les opérations avant la promesse SaaS','Le prochain gain de fiabilité vient des données, de l’identité et de la boucle conducteur.']
], 'Ces recommandations sont une analyse du projet, pas des fonctionnalités déjà livrées. Les cinq rôles sont utiles comme structure d’observation, mais chacun doit justifier un appel payant par une valeur mesurée. Le profil routine est donc préférable pour les opérations répétitives validées. Un autre framework, une base vectorielle ou une multiplication des agents ajouteraient aujourd’hui une charge d’exploitation sans résoudre les principales lacunes. Le système a une base technique explicite et vérifiable; le succès client dépend maintenant de la qualité des données terrain, du traitement des exceptions et des engagements de service.', ['docs/DECISIONS.md','docs/MODEL-POLICY.md','docs/TRANSPORT-CHECKLIST.md']);

add('Références et lecture de l’annexe',[
 ['Sources de vérité','Le code décrit le comportement; les contrats expliquent les invariants et leurs limites.'],
 ['Versions','Les tableaux suivants reprennent les versions du dépôt, pas les dernières publications.'],
 ['Périmètre de l’inventaire','87 paquets Python et 17 dépendances web/QA directes; l’arbre npm transitif est dans les lockfiles.']
], 'Le support principal est la révision U14 4c8dd4c du 11 octobre 2026. Les notes de chaque slide donnent les chemins sources. Les documentations officielles consultées confirment le rôle des bibliothèques, mais les versions affichées sont lues dans les manifestes locaux. L’annexe n’implique pas une utilisation métier directe de chaque paquet. Les statuts distinguent runtime, support de dépendance, option, outillage et installé sans usage direct. Les sources de création du diaporama utilisent Artifact Tool uniquement pour cet artefact; ce n’est pas une dépendance de l’application Genesis.', ['README.md','requirements.txt','apps/web/package.json','qa/package.json','https://react.dev/learn','https://fastapi.tiangolo.com/','https://docs.langchain.com/oss/python/langgraph/overview','https://developers.google.com/optimization/routing/vrp','https://maplibre.org/maplibre-gl-js/docs/','https://echarts.apache.org/en/index.html','https://reactflow.dev/learn']);

const references=slides.pop();
add('Événements en direct et projections',[
 ['API SSE → EventSource','Un flux unidirectionnel apporte les événements des exécutions en attente ou en cours.'],
 ['Ordre et déduplication','Les séquences permettent de fusionner historique et nouveaux événements sans doublons.'],
 ['Rafraîchissement et replay','Les projections sont relues; le replay reconstitue ensuite un état historique distinct.']
], 'L’API publie un flux Server-Sent Events par exécution. App.tsx crée EventSource lorsque le statut est queued ou running et écoute les événements genesis. mergeEvents fusionne par run_seq, trie et borne l’historique chargé. Les événements terminaux déclenchent une relecture; un rafraîchissement de cinq secondes complète le flux. Le serveur fournit une sémantique de curseur/reprise; l’interface ne traite pas le flux comme une base autoritaire isolée. Les trames invalides sont ignorées sans empêcher une actualisation explicite. SSE décrit l’observation du travail logiciel; cela ne fournit aucun GPS ni trafic réel.', ['services/genesis/api.py','services/genesis/db.py','apps/web/src/App.tsx','apps/web/src/state.ts']);

table('Les visualisations et leur question',[
 ['Graphe','Quel rôle a transmis quelle preuve à quel autre rôle ?'],
 ['Chronologie','Quand chaque invocation a-t-elle commencé et combien de temps a-t-elle pris ?'],
 ['Sankey','Combien de transmissions observées vont de chaque émetteur à chaque destinataire ?'],
 ['Comparaison','Quelle différence entre deux exécutions compatibles ?'],
 ['Heatmap','Quel scénario et quel agent concentrent la latence moyenne ?'],
 ['KPI et répartitions','Quels volumes, taux, coûts et tokens dans le périmètre choisi ?']
], 'Le graphe React Flow et la chronologie ECharts répondent à des questions d’exécution. Le Sankey compte les handoffs réellement observés, avec deux identités distinctes par rôle, émetteur et destinataire; il ne représente pas une conservation de tokens. Les comparaisons sont limitées aux scénarios/graines/provenances compatibles. La heatmap scénario × agent et son tableau d’effectifs appartiennent désormais à la rubrique Durées des agents par scénario dans Analytique. Les KPI de cohorte ne doivent pas être confondus avec le coût global non filtré. Ces visualisations demeurent des contenus contextuels, pas six onglets principaux.', ['apps/web/src/Observability.tsx','apps/web/src/Chart.tsx','apps/web/src/Analytics.tsx','docs/DATA-CONTRACT.md'], undefined, ['VUE','QUESTION À LAQUELLE ELLE RÉPOND']);

table('Benchmark et courtage : deux workflows',[
 ['Benchmark synthétique A11','Scénarios S01–S05, données générées et politiques logistiques comparables.'],
 ['Référence vs solveur','baseline_only face à solver_with_one_replan; même scénario et même graine.'],
 ['Replanification bornée','Un suffixe de journée simulée; aucune réaffectation générale de cargaison réelle.'],
 ['Courtage opérateur','Adresses et pickups/drop-offs, matrice routière, flotte courante et admission de trajets.']
], 'L’expérience historique comporte cinq scénarios, deux politiques et deux graines, soit vingt exécutions acceptées. Une politique logistique ne désigne pas une famille de modèle. Le benchmark évalue le service, le coût de flotte et les exceptions sous hypothèses synthétiques. Le courtage opérateur étend le produit à des demandes d’adresses et des trajectoires routières externes. Il possède ses propres contraintes d’affectation et d’admission. Les deux parcours partagent l’observation, les appels bornés et la comptabilité, mais leurs résultats ne sont pas directement interchangeables. Les courbes du benchmark ne démontrent pas une performance sur une flotte cliente réelle.', ['docs/LOGISTICS-SPEC.md','docs/DISPATCH.md','services/genesis/workflow.py','services/genesis/broker_runtime.py','experiments/live-manifest.json']);

add('Configuration, secrets et dépendances',[
 ['python-dotenv et variables locales','Charger les clés et paramètres côté serveur; conserver les secrets hors du dépôt.'],
 ['Manifestes versionnés','Épingler l’environnement Python et verrouiller les résolutions npm pour reproduire le profil.'],
 ['Contrôles d’exploitation','Vérifier tarifs, modèles, fournisseurs et configuration avant un appel ou un déploiement.']
], 'python-dotenv 1.2.4 charge la configuration locale pour les processus API et worker. .env.example documente les paramètres sans fournir de secrets et .gitignore exclut les configurations privées. L’application locale ne possède pas encore l’identité et l’isolation client requises pour exposer son API à des entreprises. requirements.txt contient l’environnement Python épinglé, y compris des dépendances transitives; pyproject.toml s’y réfère dynamiquement. Les package-lock.json rendent les installations JavaScript reproductibles. Les bibliothèques standard decimal, hashlib, uuid, datetime/zoneinfo, smtplib, ssl et email assurent argent exact, empreintes, identifiants, temps et courriels sans ajouter un SDK pour chaque fonction.', ['.env.example','.gitignore','pyproject.toml','requirements.txt','services/genesis/llm.py','services/genesis/notifications.py','scripts/start.ps1']);
slides.push(references);
