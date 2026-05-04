# Runbook — Dev sur iPhone réel (LAN exposure)

> **Créé le 4 mai 2026** suite à la "Mobile Recovery Day" : @thierry a constaté
> sur iPhone 14 plusieurs bugs (overflow horizontal, theme toggle qui bouffe
> l'écran, focus ring cyan, cards Dashboard coupées) invisibles en Brave
> DevTools desktop. Ce runbook documente la procédure standard pour tester
> le dev server Ankora directement sur un iPhone connecté au même WiFi.

## TL;DR

1. `npm run dev -- --hostname 0.0.0.0` (Next.js bind sur toutes interfaces)
2. `ipconfig | findstr IPv4` → noter l'IP locale Windows (ex: `192.168.1.42`)
3. Sur iPhone (même WiFi), Safari → `http://192.168.1.42:3000`
4. Smoke test 10 min (checklist §4) puis capture des bugs (§5)

---

## 1. Pourquoi tester sur un vrai iPhone

Safari iOS (WebKit) a des bugs et comportements **invisibles en Brave/Chrome
DevTools** même en mode "iPhone 14" :

- Auto-zoom sur input `font-size < 16px`
- Bug `100vh` qui inclut la barre URL escamotable
- ITP qui peut purger `localStorage` après 7j d'inactivité
- `position: sticky` qui se comporte différemment en nested scroll
- Safe-area `env(safe-area-inset-*)` qui ne s'évalue correctement qu'avec
  `viewport-fit=cover` sur un device physique
- Tap-highlight gris iOS par défaut (esthétique cassée)

**Règle Ankora** : toute PR qui touche `layout`, `nav`, `forms`,
`dashboard mobile`, `theme toggle`, `drawer/popover` doit être **smoke-testée
sur iPhone réel avant merge**. Brave DevTools "iPhone 14" est insuffisant —
il émule la résolution, pas le moteur WebKit.

L'agent QA `mobile-ios-auditor` (cf. `.claude/agents/mobile-ios-auditor.md`)
documente la checklist programmatique. Ce runbook documente la **procédure
manuelle** côté @thierry pour exécuter le smoke test physique.

---

## 2. Pré-requis

> **OS scope** : ce runbook est rédigé pour le setup principal de @thierry —
> **Windows 11 + PowerShell 7**. Les commandes (`ipconfig`, `node.exe`,
> Pare-feu Windows) sont Windows-specific. Équivalents pour les autres OS :
>
> - **macOS** : `ifconfig | grep "inet "` pour l'IP locale, le firewall
>   macOS s'ouvre automatiquement à la première écoute Node sur LAN
> - **Linux** : `ip -4 addr show | grep inet` pour l'IP, vérifier que
>   `ufw` (ou équivalent) ne bloque pas le port 3000 — `sudo ufw allow 3000/tcp`
>   en réseau de confiance
>
> La logique est identique sur les 3 OS (bind `0.0.0.0`, autoriser le port,
> trouver l'IP LAN), seules les commandes diffèrent.

- iPhone et PC sur le **même réseau WiFi** (même SSID, pas de bridge VPN
  côté PC qui isolerait l'iPhone du subnet)
- Firewall Windows : autoriser `node.exe` sur les **réseaux privés** (pas
  publics). Si une popup Windows Defender apparaît au premier `npm run dev`,
  cocher uniquement "Réseaux privés".
- Aucun proxy d'entreprise actif sur le PC qui forcerait `localhost`-only

---

## 3. Procédure pas-à-pas

### 3.1 Lancer le dev server bindé sur toutes les interfaces

Par défaut Next.js bind sur `localhost` (donc inaccessible depuis l'iPhone).
Ajouter le flag `--hostname 0.0.0.0` :

```powershell
# PowerShell 7 (pwsh) — terminal recommandé
cd F:\PROJECTS\Apps\ankora
npm run dev -- --hostname 0.0.0.0
```

Sortie attendue :

```
   ▲ Next.js 16.x.x (Turbopack)
   - Local:        http://localhost:3000
   - Network:      http://192.168.1.42:3000   ← cette URL
```

Si la ligne `Network:` n'apparaît pas, le bind a échoué — vérifier le flag.

### 3.2 Trouver l'IP locale Windows (si Next.js ne l'affiche pas)

```powershell
ipconfig | findstr /C:"IPv4"
```

Repérer l'IP de l'interface WiFi active (pas `vEthernet (WSL)` ni
`vEthernet (Default Switch)`, qui sont des bridges Hyper-V/WSL2 inutiles
ici). Format typique : `192.168.x.x`.

### 3.3 Connecter l'iPhone

1. iPhone → Réglages → WiFi → vérifier le SSID = même que PC
2. Safari iOS → barre d'adresse → `http://192.168.1.42:3000` (remplacer par
   votre IP)
3. Premier chargement : Safari peut afficher un avertissement "site non
   sécurisé" si Ankora local force HTTPS. Pour le dev local HTTP, accepter.
   Pour HTTPS local self-signed, accepter le certificat.

### 3.4 Cas d'échec : "Cette page ne peut pas s'afficher"

Causes les plus fréquentes :

- **Firewall Windows** bloque le port 3000 : Windows Security → Pare-feu →
  Autoriser une application → `node.exe` coché en "Privé"
- **Bind localhost-only** : vérifier que la sortie Next.js affiche bien
  `Network: http://192.168...`, pas seulement `Local:`
- **Réseaux différents** : iPhone sur 4G ou WiFi invité (réseau isolé du
  LAN privé). Repasser sur le WiFi principal.
- **VPN actif** sur PC : un VPN peut router le trafic LAN ailleurs,
  désactiver temporairement

---

## 4. Validation — Smoke test mobile (10 min)

Checklist standard à exécuter sur iPhone après chaque PR layout/nav/forms.
Les bugs détectés sont à reporter via `mobile-ios-auditor` ou en note PR.

### 4.1 Landing publique (`/`)

- [ ] Aucun scroll horizontal sur la page entière (faire glisser le doigt
      latéralement → rien ne bouge à droite/gauche)
- [ ] Hero waterfall lisible, pas de débordement
- [ ] CTA "Se connecter" visible OU accessible en ≤ 2 taps depuis le
      hamburger
- [ ] Theme toggle compact (icon ou popover petit), ne couvre pas l'écran
- [ ] Footer pleinement visible, pas de zone collée au home indicator

### 4.2 Auth (`/login`, `/signup`)

- [ ] Tap dans un input → **pas d'auto-zoom** (font-size ≥ 16px)
- [ ] Focus ring couleur **emerald** Ankora, pas cyan/blue par défaut
- [ ] Clavier iOS s'ouvre avec le bon layout (email = clavier email,
      password = sécurisé)
- [ ] Bouton "Se connecter" / "S'inscrire" tappable confortablement
      (≥ 44px de hauteur réelle)

### 4.3 Dashboard authentifié (`/app`)

- [ ] Cards Dashboard pleinement visibles (pas coupées à droite — bug
      PR-D2 à confirmer fixé)
- [ ] Scroll vertical fluide, pas de jank
- [ ] Sticky header (si présent) ne chevauche pas la zone notch
- [ ] Drawer / menu utilisateur s'ouvre, ferme au tap extérieur ET au swipe

### 4.4 Navigation drawer

- [ ] Hamburger ouvre un drawer plein écran ou latéral
- [ ] Tab clavier (si testé en Bluetooth) cycle dans le drawer (focus trap)
- [ ] Tap sur l'overlay extérieur ferme le drawer
- [ ] "Se déconnecter" visible et accessible en ≤ 2 taps

### 4.5 Theme toggle

- [ ] Toggle visible dans le header (pas caché derrière hamburger)
- [ ] Clic → popover compact, ne dépasse pas le viewport
- [ ] Sélection light/dark/system applique immédiatement, pas de flash

### 4.6 Simulateur what-if (si présent)

- [ ] Drawer s'ouvre, sliders manipulables au touch
- [ ] Pas de scroll horizontal dans le drawer
- [ ] Bouton fermer (X) tappable

### 4.7 Persistance session

- [ ] Refresh la page (swipe down depuis le top de Safari) → toujours
      authentifié
- [ ] Fermer Safari → réouvrir → session toujours active (cookies
      httpOnly OK)

---

## 5. Capture iPhone & partage

### 5.1 Screenshot

- iPhone 14+ (sans bouton home) : **Power + Volume Haut** simultanés
- iPhone avec home button : **Power + Home**
- Le screenshot apparaît brièvement en bas-gauche → tap pour annoter
  (entourer le bug en rouge)

### 5.2 Partage vers PC

Trois options selon ce qui est disponible :

1. **AirDrop** vers un Mac (n/a si @thierry n'a que Windows)
2. **iCloud Drive** : sauvegarder dans Photos → iCloud Photos sur PC
   (Windows iCloud client) → récupérer dans `C:\Users\thier\Pictures\iCloud Photos`
3. **Email à soi-même** : Photos → Partager → Mail → envoyer à
   `thierryvm@gmail.com`. Le plus rapide en pratique.

Le screenshot peut ensuite être joint au commentaire PR ou au handoff
@cowork avec annotation textuelle (ex: "page /app, scroll latéral
visible 4px à droite du hero").

### 5.3 Capture vidéo (bug d'animation)

iPhone : **Centre de contrôle → bouton enregistrement écran** (cercle plein).
Le clip MOV est sauvegardé dans Photos, partage identique aux screenshots.

---

## 6. Limites & alternatives

### 6.1 Pas de DevTools iOS sans Mac

Safari Web Inspector (l'équivalent DevTools pour Safari iOS) **nécessite
un Mac connecté à l'iPhone via USB**. @thierry n'ayant pas de Mac, le
debug introspectif (Console, Network, Inspector) sur iPhone réel est
impossible.

### 6.2 Stratégie de debug en deux temps

Pour les bugs qui demandent introspection (DOM, computed CSS, network) :

1. **Brave DevTools en mode "iPhone 14"** pour cerner la cause probable
   (DOM, classes Tailwind appliquées, breakpoints)
2. **Playwright WebKit** (à mettre en place en PR-QA-1b) pour scripter
   le bug et avoir un environnement WebKit reproductible avec accès logs
3. **iPhone réel** pour valider que le fix fonctionne en vrai

L'agent `mobile-ios-auditor` couvre les bugs détectables par lecture
statique du code. Les bugs runtime (rendering, performance) requièrent
les outils ci-dessus.

### 6.3 Quand un Mac devient indispensable

Si Ankora introduit des features lourdes en JS (animations 60fps,
canvas, Service Worker custom) ou si les bugs Safari deviennent
récurrents et non-diagnosticables sans Inspector, considérer :

- Mac mini d'occasion (~400€) pour Safari Web Inspector
- BrowserStack / Sauce Labs (payant — hors budget 0 € actuel)
- Demander à un proche développeur Mac pour une session de debug
  ponctuelle

À retravailler post-v1.0 si nécessaire.

---

## Rollback

Pas de rollback nécessaire — ce runbook ne déclenche aucune mutation
(pas de migration DB, pas de modification env vars, pas de déploiement).
Pour annuler le bind LAN : `Ctrl+C` sur le terminal `npm run dev`, le
serveur s'arrête, l'iPhone perd la connexion.

## Troubleshooting

| Symptôme                                        | Cause probable                                    | Fix                                                                                  |
| ----------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| iPhone : "Cette page ne peut pas s'afficher"    | Firewall Windows bloque port 3000                 | Autoriser `node.exe` en réseau privé                                                 |
| iPhone affiche `localhost` au lieu de l'IP      | Mauvaise URL tapée                                | Re-vérifier l'IP via `ipconfig`, retaper                                             |
| Page charge mais styles cassés / mismatch       | Service Worker en cache                           | Safari → Réglages → Effacer historique et données de sites                           |
| Modifications code non visibles (HMR cassé)     | Turbopack HMR sur LAN parfois capricieux          | Refresh manuel (swipe down depuis le top de Safari)                                  |
| iPhone perd la connexion après quelques minutes | Mode économie d'énergie ou WiFi qui se déconnecte | Désactiver le mode économie iPhone, garder l'écran allumé pendant la session de test |
| Bug visible en Brave DevTools mais pas iPhone   | Émulation Brave incomplète                        | Toujours valider sur iPhone réel — Brave est un proxy, pas une source de vérité      |
