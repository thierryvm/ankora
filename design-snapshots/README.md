# Design Snapshots — Ankora

Dossier pour archiver les snapshots ZIP du projet Claude Design (research preview, fragile).

## Pourquoi ce dossier existe

Claude Design est en research preview Anthropic. La panne du 2026-05-09 (~3h down) a montré que la disponibilité n'est pas garantie. Une perte de projet en cours de session = des heures de design à reproduire from scratch.

Donc : **chaque jalon de session = 1 snapshot ZIP archivé ici** avec date + état.

## Convention de naming

`YYYY-MM-DD-{état}-{contenu}.zip`

Exemples :

- `2026-05-09-FINAL-bloc-e-complet-8-patches.zip` — fin de session marathon, après application des 8 patches Bloc E
- `2026-05-09-PRE-PATCH-bloc-e-base.zip` — avant application des patches (sécurité)
- `2026-05-12-handoff-v1-livré.zip` — au moment du handoff package construit pour CC Ankora

## Comment exporter

Dans claude.ai/design (projet `019dbeb5-1a7d-7b39-b9c5-ce01e2a48e7e`) :

1. Menu **Share** → **Download project as .zip**
2. Sauvegarder ici avec le nom selon convention ci-dessus
3. Vérifier que le ZIP fait au moins ~5 MB (sinon il est tronqué)

## Liens utiles

- Projet Claude Design : https://claude.ai/design/p/019dbeb5-1a7d-7b39-b9c5-ce01e2a48e7e
- Dossier handoff structuré (différent) : `F:\PROJECTS\Apps\ankora\design_handoff_ankora_v1\`
- Notes de session : `Athenaeum/10_Projects/ankora/cowork-handoffs/`
