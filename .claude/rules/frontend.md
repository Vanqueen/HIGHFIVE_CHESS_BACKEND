---
description: Règles applicables aux travaux frontend et UI.
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.css"
  - "**/*.scss"
  - "**/*.html"
---

# Règles frontend
- Inspecte les composants, styles et conventions proches avant d'ajouter une nouvelle abstraction.
- Réutilise les tokens et composants existants; n'introduis pas une seconde façon de faire la même chose.
- Garde les composants lisibles et limite les effets de bord.
- Préserve le clavier, les labels, les états de focus et le contraste.
- Vérifie le comportement mobile et les états de chargement/erreur/absence de données.
- N'ajoute pas de dépendance pour une fonctionnalité simple que le projet sait déjà gérer.
- Ne change pas l'API ou la logique métier pour régler uniquement un problème visuel.
