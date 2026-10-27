---
name: frontend-architecture
description: Modifier ou étendre le frontend en respectant son architecture, ses types, ses composants et ses conventions existantes.
---

# Frontend Architecture & Clean Code

## Exploration ciblée
- Repère le framework, les scripts package.json, les fichiers de configuration et les composants voisins.
- Cherche d'abord un composant ou un utilitaire existant avant d'en créer un.
- Lis seulement les fichiers nécessaires pour comprendre le flux concerné.

## Implémentation
- Préserve les conventions de nommage, le style, les types et les patterns du dépôt.
- Sépare présentation, logique métier et accès aux données selon l'architecture déjà adoptée.
- Réutilise les composants; évite les abstractions prématurées et la duplication.
- Ne modifie pas les contrats API ou le schéma des données sans justification.
- Évite les changements hors périmètre.
- N'ajoute aucune dépendance sans expliquer pourquoi une dépendance existante ne suffit pas.

## Vérification
- Exécute les tests, le lint ou le build pertinents lorsqu'ils sont disponibles.
- Si une vérification n'a pas été exécutée, indique-le explicitement.
- Termine par un résumé court des fichiers/comportements modifiés et des vérifications.
