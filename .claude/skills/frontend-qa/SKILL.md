---
name: frontend-qa
description: Diagnostiquer un bug frontend et vérifier une modification UI avec des contrôles ciblés et reproductibles.
---

# Frontend Debugging & QA

1. Reformule le symptôme en une phrase et identifie les conditions où il apparaît.
2. Reproduis le problème ou examine les traces disponibles avant de modifier le code.
3. Trouve la cause probable dans le plus petit périmètre raisonnable.
4. Applique une correction minimale qui ne masque pas le problème.
5. Vérifie le cas corrigé et les régressions les plus proches.
6. Pour l'UI, si le navigateur ou les captures sont disponibles, vérifie le rendu desktop et mobile ainsi que les états pertinents.
7. Vérifie les erreurs console et les interactions critiques si les outils sont disponibles.
8. N'affirme jamais avoir exécuté une vérification que tu n'as pas exécutée.

## Économie
Ne lance pas toute la suite de tests pour un changement trivial si une vérification ciblée suffit. Lance les tests plus larges lorsque le risque ou la portée le justifie.

## Réponse finale
- Cause :
- Correction :
- Vérifications exécutées :
- Risque ou point restant, s'il y en a un :
