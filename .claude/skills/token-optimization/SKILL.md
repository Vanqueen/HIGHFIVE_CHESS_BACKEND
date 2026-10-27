---
name: token-optimization
description: Réduire les lectures, appels d'outils et sorties inutiles tout en préservant la qualité et la fiabilité du développement.
---

# Token Optimization & Context Management

## Règles
- Commence par la demande et les instructions pertinentes; ne scanne pas tout le dépôt par défaut.
- Utilise les commandes de recherche ciblées et limite la lecture aux fichiers directement concernés et à leurs dépendances nécessaires.
- Évite les sorties terminal volumineuses; filtre les résultats et demande des extraits précis.
- Ne répète pas dans la réponse finale le contenu déjà visible dans les fichiers ou le diff.
- Ne génère pas de plan long pour une modification simple.
- N'utilise pas de sous-agent, de navigateur ou de serveur MCP à moins que le gain attendu justifie son coût.
- Regroupe les vérifications utiles au lieu de répéter les mêmes commandes.
- Ne conserve pas en mémoire des détails éphémères; documente uniquement les décisions durables.
- Si une information est inconnue, inspecte la source pertinente au lieu de spéculer.

## Adapter l'effort
- Petite correction : inspecter le composant, corriger, exécuter une vérification ciblée.
- Nouvelle page : examiner le design system et les composants voisins, concevoir, implémenter, vérifier le rendu si possible.
- Refactorisation importante : cartographier les dépendances nécessaires et tester les comportements affectés.
- Incident ou bug complexe : recueillir des preuves avant de modifier.

## Réponse finale
Reste bref : résultat, fichiers principaux, tests exécutés et éventuels blocages. Ne sacrifie jamais la sécurité, la correction ou les tests importants pour économiser quelques tokens.
