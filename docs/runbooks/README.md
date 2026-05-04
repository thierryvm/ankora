# Runbooks — Ankora

Ce dossier regroupe les **runbooks opérationnels** d'Ankora : les procédures
pas-à-pas qu'on suit pour installer, configurer, diagnostiquer ou faire tourner
une brique technique de l'app.

## Différence avec les autres docs

| Type de doc           | But                                              | Exemple                                                 |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| **ADR** (`docs/adr/`) | Pourquoi on a pris une décision — immuable       | ADR-001 No-PSD2 : on n'utilise pas PSD2, voici pourquoi |
| **Audit** (`docs/*/`) | Rapport ponctuel d'état — instantané daté        | AUDIT-2026-04-20 cybersec : état à une date T           |
| **Runbook** (ici)     | Comment faire une opération — vivant, mis à jour | Comment poser les env vars Upstash sur Vercel           |

Les runbooks sont **vivants** : si une procédure change (nouvelle UI Vercel,
nouvelle région Upstash, nouveau pattern de rotation), on met à jour le runbook
au lieu d'en créer un nouveau. Chaque mise à jour doit comporter la date et un
one-liner en haut du runbook.

## Index

| #   | Runbook                                                                                    | Dernière MAJ |
| --- | ------------------------------------------------------------------------------------------ | ------------ |
| 001 | [Upstash + Vercel : setup du rate-limit fail-closed](./RUNBOOK-upstash-ratelimit-setup.md) | 2026-04-20   |
| 002 | [Supabase : déploiement des migrations](./supabase-migrations.md)                          | 2026-05-03   |
| 003 | [Dev sur iPhone réel (LAN exposure)](./dev-on-iphone.md)                                   | 2026-05-04   |

## Conventions

- Nommage : `RUNBOOK-<sujet-kebab-case>.md`
- Chaque runbook commence par un **TL;DR** (≤ 5 lignes) pour sauter direct à
  l'action si on n'a pas le temps de tout lire.
- Chaque commande / clic est explicite. Pas de "et après tu fais le truc
  habituel" — on écrit pour quelqu'un qui arrive à froid.
- Les secrets sont **toujours** en placeholders (`<YOUR_TOKEN>`, `<INSTANCE>`,
  etc.). Jamais de vraie valeur en clair dans un runbook committé.
- Sections minimales : **Contexte**, **Pré-requis**, **Procédure pas-à-pas**,
  **Validation**, **Rollback**, **Troubleshooting**.

## Quand créer un runbook ?

Tu crées un runbook dès que :

- une opération a été faite une fois et risque d'être refaite (setup DB,
  rotation credentials, restore backup, promotion d'un env) ;
- une opération n'est **pas triviale** — si elle se fait en 2 clics évidents,
  pas besoin de runbook ;
- une opération mélange plusieurs services externes (Upstash + Vercel + GitHub)
  et la chorégraphie est importante.

À l'inverse, **pas** de runbook pour :

- du `npm install` ou un `git commit` standard ;
- ce qui est déjà documenté ailleurs (README, `docs/stack-and-cli.md`) ;
- un oneshot qui ne se reproduira jamais.
