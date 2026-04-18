---
description: Détermine automatiquement la prochaine PR à exécuter et propose de la lancer
---

Lis `docs/ROADMAP.md` §"Ordre d'exécution des PR techniques".

Trouve la **première** ligne du tableau dont le statut est 🚧 (en cours) ou ⏳ (en attente) ou 📋 (prompt prêt), en excluant celles marquées ✅.

Affiche à Thierry :

> **Prochaine PR à lancer : `{ID}` — {nom}**
>
> Statut : {statut}
> Prérequis : {liste}
> Prompt : `prompts/{ID}-*.md`
> Issue GitHub : {numéro si existe, sinon "aucune — sera créée au lancement"}
>
> Veux-tu que je lance `/pr-start {ID}` ?

Ne fais rien d'autre. Attends la réponse.
