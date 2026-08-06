# Runbook — quelqu'un ne peut plus présenter son second facteur

Depuis que la connexion **exige** le second facteur quand il existe, perdre son
moyen de le produire ferme la porte. Ce document dit comment la rouvrir.

> **Ce dépôt est public.** Ce runbook dit **quoi faire**, pas **comment
> contourner** : ni requête prête à coller, ni nom de table interne, ni
> emplacement de clé. La procédure exacte se lit dans la console Supabase par
> quelqu'un qui y a déjà accès — et si vous n'y avez pas accès, ce document ne
> doit pas vous y aider.

---

## Avant tout : est-ce vraiment une perte ?

Trois causes se confondent avec « j'ai perdu mon second facteur », et deux se
règlent sans rien toucher :

1. **Décalage d'horloge.** Un code TOTP dépend de l'heure de l'appareil. Un
   téléphone qui a dérivé de plus de 30 secondes produit des codes refusés.
   Vérifier le réglage automatique de l'heure avant toute autre chose.
2. **Trop d'essais.** La vérification est limitée à 10 tentatives par 15 minutes
   et par compte. Après un enchaînement de fautes de frappe, attendre suffit —
   le message parle de quota, pas de code invalide.
3. **Le secret est ailleurs qu'on le croit.** Un gestionnaire de mots de passe
   synchronisé (Dashlane, 1Password, trousseau iCloud) porte souvent le secret
   sur le navigateur autant que sur le téléphone. Le téléphone perdu ne ferme
   alors rien du tout.

Ce n'est une vraie perte que si les trois sont écartés.

---

## La procédure

**Préflight d'abord, sans exception :**

```bash
npm run preflight        # exiger un GO — le compte doit être thierryvm
```

Ensuite, depuis la console Supabase du projet de production, retirer le facteur
du compte concerné. La personne peut alors se reconnecter avec son seul mot de
passe, et **doit ré-enrôler un facteur immédiatement** : d'ici là son compte
n'est plus protégé que par ce mot de passe.

**Deux effets à connaître, sinon la procédure surprend :**

- ré-enrôler **déconnecte toutes les autres sessions** du compte. C'est le
  comportement de Supabase, pas un incident ;
- le retrait laisse une trace dans le journal d'audit. C'est voulu : une
  suppression de facteur qui ne laisserait rien derrière elle serait exactement
  le contournement silencieux que le contrôle est censé empêcher.

---

## L'hypothèse que ce runbook porte, et qu'il faut vérifier

**Il suppose que la personne qui exécute la procédure y a accès.**

Aujourd'hui l'administrateur et l'unique porteur d'un facteur sont la même
personne. Si son second facteur Supabase vivait sur le même appareil que celui
d'Ankora, la perte de cet appareil fermerait les deux portes à la fois et ce
runbook ne se refermerait pas sur lui-même.

**Vérifié le 6 août 2026** : l'accès à la console Supabase passe par un
gestionnaire de mots de passe sur navigateur, indépendant du téléphone. La
condition est donc remplie. **À revérifier si ce gestionnaire change.**

---

## Ce qui remplacera ce runbook

Des **codes de secours** : dix codes à usage unique remis à l'enrôlement, qui
rendent la récupération autonome et ne dépendent d'aucun administrateur.

Ils ne sont pas encore là parce que Supabase n'en fournit pas nativement pour le
TOTP — il faudrait les construire (stockage haché, consommation unique,
affichage unique), ce qui est de la cryptographie applicative sur une surface où
l'erreur se paie cher.

Ce runbook est proportionné tant qu'**une seule personne** porte un facteur et
qu'elle est l'administrateur. **Il cesse de l'être dès qu'un deuxième compte
active la 2FA** — c'est ce seuil, et non une date, qui déclenche le chantier des
codes de secours.
