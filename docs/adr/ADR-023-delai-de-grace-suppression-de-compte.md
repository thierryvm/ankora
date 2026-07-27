# ADR-023 — Délai de grâce de la suppression de compte : 30 → 14 jours

- **Statut** : Accepted
- **Date** : 27 juillet 2026
- **Décideurs** : @thierry (validation explicite), @cc-ankora
- **Contexte technique** : `src/lib/gdpr/deletion.ts` écrit `scheduled_for = now + 30 jours` ;
  `executeDeletion()` n'a **aucun appelant** ; `/app/settings/deletion-status` affiche la
  date et un décompte de jours restants
- **Exécution** : session suivante (étape 3b). Cet ADR ne contient pas de code —
  doctrine projet : décision en session N, implémentation en session N+1.

---

## Contexte

L'étape 3b doit brancher un cron qui exécute enfin les demandes de suppression. En
préparant ce travail, un contrôle de conformité a relevé un problème que ni l'audit
sécurité ni l'audit RGPD de la nuit du 26 au 27 juillet n'avaient vu, parce qu'ils
regardaient le code et non le calendrier.

**L'art. 12(3) du RGPD impose de répondre à une demande d'effacement « dans les meilleurs
délais et en tout état de cause dans un délai d'un mois ».** Le délai de grâce actuel est
de 30 jours. L'effacement est donc programmé au bord exact de la limite légale : il suffit
que le cron échoue une fois, ou tourne quelques heures trop tard, pour être hors délai.

Aucune règle n'impose un délai de grâce. C'est une courtoisie produit — laisser à
quelqu'un le temps de changer d'avis — pas une obligation réglementaire.

## Options envisagées

**A. Raccourcir à 14 jours.** L'effacement tombe à mi-parcours du délai légal. Deux
semaines de marge absorbent une panne de cron, un week-end férié, une reprise manuelle.

**B. Garder 30 jours et documenter la distinction.** Soutenir que la _réponse_ est
immédiate — l'écran confirme la prise en compte — et que la grâce est une fenêtre de
rétractation offerte, pas un délai de traitement. Défendable, mais c'est un argument à
tenir devant une autorité de contrôle plutôt qu'un problème résolu.

**C. Ne rien changer.** L'option actuelle : 30 jours, sans rien écrire. La seule
indéfendable.

## Décision

**Option A — 14 jours.**

Elle supprime le problème au lieu de l'argumenter. Le coût produit est nul : personne
n'a jamais réclamé un mois pour se rétracter, et deux semaines restent une fenêtre
généreuse au regard de ce que pratique le secteur.

Corollaire assumé : le délai de grâce n'est **pas** le délai de réponse. La réponse à la
demande est immédiate et matérialisée par l'écran de statut ; la grâce est une faveur qui
tient entièrement dans le mois légal, avec de la marge.

## Conséquences

### À changer, dans la PR de l'étape 3b et pas avant

Le changement n'a de sens qu'accompagné du cron. Passer à 14 jours **sans** exécuteur ne
ferait qu'avancer la date d'une promesse toujours pas tenue.

- `src/lib/gdpr/deletion.ts` — la constante de 30 jours
- Sept chaînes dans `messages/*.json`, **× 5 locales** : FAQ, politique de
  confidentialité (§ conservation), page de suppression, toast de confirmation
- `docs/ARCHITECTURE.md` — le flux critique décrit « grace 30j »
- Tests : la spec qui vérifie la date programmée

### Trois obligations non-code identifiées par le même contrôle

Elles ne bloquent pas l'étape 3b mais doivent être traitées :

1. **Sauvegardes.** Supabase conserve des sauvegardes automatiques et du PITR. Effacer de
   la base vivante n'efface pas des sauvegardes. La position admise est de ne jamais
   restaurer des données effacées et de laisser la rotation faire son œuvre — **à
   condition de l'écrire**. Rien dans la politique n'en parle aujourd'hui.
2. **Impossibilité de confirmer l'effacement.** L'application n'envoie aucun email, aucune
   dépendance d'envoi n'est installée. Une fois le compte supprimé, la personne ne peut
   plus se connecter pour consulter l'écran de statut. Il n'existe donc aucun canal pour
   l'informer de la suite donnée (art. 12(3)). À trancher : ajouter un canal, ou assumer
   par écrit qu'il n'y en a pas.
3. **Journaux des sous-traitants.** Vercel et Supabase conservent des journaux contenant
   adresses IP et identifiants, qui survivent à la suppression applicative. À mentionner
   dans la politique avec leur durée de rétention.

### Ce qui a été écarté

**L'art. 8 (consentement des mineurs, 13 ans en Belgique) ne s'applique pas.** Les trois
comptes tiers de la production appartiennent à des membres de la famille du responsable
de traitement, **tous majeurs**, confirmé par lui le 27 juillet 2026.

**Une AIPD (art. 35) n'est probablement pas requise** : petite échelle, pas de catégories
particulières au sens de l'art. 9, pas de surveillance systématique. Le motif est consigné
ici — c'est cette trace, et non l'absence d'AIPD, qui vaut accountability.

## Références

- `docs/compliance/2026-07-27-registre-defaillance-journal-audit.md`
- `src/lib/gdpr/deletion.ts`, `src/lib/actions/settings.ts`
- Contrôle de conformité mené le 27 juillet 2026 avec la compétence
  `legal:compliance-check` (plugin Legal d'Anthropic)
