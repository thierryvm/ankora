import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WCAG 2.1 contrast guard for the semantic status colours (ADR-035).
 *
 * Why this exists: until 2026-07-29 the four status tokens had a single value
 * shared by both themes, so each one failed AA in one of the two — `text-danger`
 * at 3.59:1 on a dark card, `text-warning` at 3.19:1 on a light one, `text-info`
 * in BOTH (4.10 / 4.23). The app claims WCAG 2.2 AA; on this point it held in
 * neither theme, across ~70 production usages.
 *
 * `globals-tokens.test.ts` pins the hex values by regex, which catches an
 * accidental deletion but says nothing about whether a *new* value is legible.
 * This test computes the real relative luminance and ratio, so a future token
 * change is judged on what it does to a reader rather than on whether someone
 * remembered to update a regex.
 *
 * Strategy mirrors `globals-tokens.test.ts`: read the CSS as text. jsdom has
 * flaky support for Tailwind v4 `@theme {}` blocks, and getComputedStyle would
 * not resolve the `[data-theme='dark']` cascade here anyway.
 */
const cssPath = resolve(__dirname, '..', 'globals.css');

/**
 * Every lookup below runs on the COMMENT-STRIPPED source, never the raw file.
 *
 * This is not tidiness, it is the fix for a live defect. `globals.css` documents
 * each token next to its value, comments included — and one of those comments,
 * inside `@theme`, reads "Dark overrides live in [data-theme='dark']" with the
 * same single quotes as the real selector. It is therefore the FIRST occurrence
 * of that marker in the file, and the old `indexOf` landed on it. The test only
 * ever passed because no `{` happened to sit between that sentence and the real
 * block, so the brace scan fell through onto the right one by accident. Insert
 * one rule in between and `DARK_BLOCK` silently becomes another block — green
 * test, wrong subject.
 *
 * Comments are replaced by a SPACE, not by nothing, so stripping can never weld
 * two adjacent tokens into one.
 */
const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * Body of the first block whose selector STARTS a rule with `marker`.
 *
 * Two hardenings, and the order between them is load-bearing: strip first, then
 * anchor. Anchoring on the raw text would fail, because in the raw file the
 * `[data-theme='dark']` marker is preceded by "live in " — it only becomes
 * `}`-preceded once the comment carrying it is gone.
 *
 * The anchor is a SEARCH, not a validation: occurrences are walked until one
 * starts a rule. Rejecting the first occurrence outright would throw the day
 * someone reorders the file — turning a silent false positive into a broken
 * test, which is not an improvement. It also skips substring hits inside a
 * larger selector: `[data-theme='dark']` appears mid-selector in the paper
 * scopes below, preceded by `(`, and must not be mistaken for the dark block.
 */
function blockAfter(marker: string): string {
  for (let from = 0; from < css.length;) {
    const start = css.indexOf(marker, from);
    if (start === -1) break;
    const before = css.slice(0, start).trimEnd();
    const prev = before[before.length - 1];
    if (prev === undefined || prev === '}' || prev === ';') {
      const open = css.indexOf('{', start);
      // Starting a rule is not the same as having a BODY. A declarative at-rule
      // ends at its `;` — `@layer theme, base, …;` is the live example — and
      // taking "the next `{`" there hands back some other rule's body without a
      // word. That is the very failure this helper was hardened to kill, so the
      // anchor has to prove the brace belongs to the marker's own rule.
      if (open === -1 || css.slice(start, open).includes(';')) {
        from = start + 1;
        continue;
      }
      let depth = 0;
      for (let i = open; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') {
          depth--;
          if (depth === 0) return css.slice(open + 1, i);
        }
      }
      throw new Error(`Unbalanced braces after ${marker}`);
    }
    from = start + 1;
  }
  throw new Error(`No rule starts with this marker in globals.css: ${marker}`);
}

const THEME_BLOCK = blockAfter('@theme');
const DARK_BLOCK = blockAfter("[data-theme='dark']");

/**
 * Custom-property names declared in a block, in source order.
 *
 * Matches the name itself with a lookahead rather than capturing it, so the
 * result is `m[0]` — the only index TypeScript knows is always present on a
 * successful match. No cast needed, and none wanted: a cast here would hide the
 * one thing worth knowing, namely whether the pattern still matches anything.
 */
function declaredProps(block: string): string[] {
  return [...block.matchAll(/--[\w-]+(?=\s*:)/g)].map((m) => m[0]);
}

function tokenIn(block: string, name: string): string {
  // `\s*` before the colon, like `declarationCount` and `fileToken`: three
  // readers of the same declarations must agree on what one looks like.
  const m = block.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m?.[1]) throw new Error(`Token --${name} not found (or not a 6-digit hex)`);
  return m[1].toLowerCase();
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.1 contrast ratio, always >= 1. */
function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** AA for normal-size text. */
const AA_NORMAL_TEXT = 4.5;

const STATUS_TOKENS = ['color-success', 'color-warning', 'color-danger', 'color-info'] as const;

describe('globals.css — WCAG AA contrast of semantic status colours (ADR-035)', () => {
  const lightSurface = tokenIn(THEME_BLOCK, 'color-card');
  const darkSurface = tokenIn(DARK_BLOCK, 'color-card');

  it('the two card surfaces are the ones the ratios are computed against', () => {
    expect(lightSurface).toBe('#ffffff');
    expect(darkSurface).toBe('#111a2e');
  });

  describe.each(STATUS_TOKENS)('--%s', (token) => {
    it('passes AA 4.5:1 on the light card', () => {
      const value = tokenIn(THEME_BLOCK, token);
      const ratio = contrastRatio(value, lightSurface);
      expect(
        ratio,
        `--${token} is ${value} on ${lightSurface} → ${ratio.toFixed(2)}:1, below AA ${AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it('has a dark-mode override', () => {
      // A token with no override inherits its light value onto a navy card,
      // which is exactly how all four came to fail AA in one theme each.
      expect(
        DARK_BLOCK,
        `--${token} has no [data-theme='dark'] override; one value cannot pass AA on both surfaces`,
      ).toMatch(new RegExp(`--${token}:\\s*#[0-9a-fA-F]{6}`));
    });

    it('passes AA 4.5:1 on the dark card', () => {
      const value = tokenIn(DARK_BLOCK, token);
      const ratio = contrastRatio(value, darkSurface);
      expect(
        ratio,
        `--${token} is ${value} on ${darkSurface} → ${ratio.toFixed(2)}:1, below AA ${AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });

  describe('brand text token (the one `text-brand-*` surface used for prose)', () => {
    it('passes AA on both themes', () => {
      const light = tokenIn(THEME_BLOCK, 'color-brand-text');
      const dark = tokenIn(DARK_BLOCK, 'color-brand-text');
      expect(contrastRatio(light, lightSurface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(dark, darkSurface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it('--color-brand-600 stays a distinct step of the scale, not a copy of 700', () => {
      // ADR-035 considered aligning --color-brand-600 with the AA value
      // #0f766e. That is --color-brand-700 verbatim, so it would have collapsed
      // two steps of the palette to fix a token used for focus rings and a
      // single decorative list marker. The marker moved to --color-brand-text
      // instead; the scale is left alone.
      expect(tokenIn(THEME_BLOCK, 'color-brand-600')).not.toBe(
        tokenIn(THEME_BLOCK, 'color-brand-700'),
      );
    });
  });

  /**
   * ADR-036 — warning must stay legible AND stay apart from the laiton.
   *
   * The @cowork decision of 2026-04-25 pinned `--color-warning` to amber
   * `#d97706` for one reason: an admin pigment (`--color-accent-*`, laiton
   * nautique) and a warning colour that read as the same swatch is a semantic
   * confusion. That decision had no test, so ADR-035 could reach AA with
   * `#a35a06` without noticing it had dropped the separation to 1.03 — two
   * colours of practically identical lightness.
   *
   * A second criterion therefore gets a second assertion. 1.30 is the floor:
   * `#d97706` scored 1.60 and was considered distinct, `#a35a06` scored 1.03
   * and was not, so the threshold sits between them, nearer the failing side.
   */
  describe('--color-warning vs the laiton admin pigment', () => {
    /** Below this, warning and the admin accent read as the same swatch. */
    const MIN_SEPARATION = 1.3;

    it.each([
      ['light', THEME_BLOCK, 'color-accent-600'],
      ['dark', DARK_BLOCK, 'color-accent-text'],
    ] as const)('stays separable in %s mode', (_theme, block, laitonToken) => {
      const warning = tokenIn(block, 'color-warning');
      const laiton = tokenIn(block, laitonToken);
      const separation = contrastRatio(warning, laiton);
      expect(
        separation,
        `--color-warning ${warning} vs --${laitonToken} ${laiton} → ${separation.toFixed(2)} of luminance separation, under ${MIN_SEPARATION}`,
      ).toBeGreaterThanOrEqual(MIN_SEPARATION);
    });
  });

  /**
   * Anti-regression on the exact defect ADR-035 fixes: before the change, each
   * of these four had one theme below AA. Asserting the *pair* passes stops a
   * future edit from fixing one theme by breaking the other.
   */
  it('no status token is legible in only one of the two themes', () => {
    const failures = STATUS_TOKENS.flatMap((token) => {
      const light = contrastRatio(tokenIn(THEME_BLOCK, token), lightSurface);
      const dark = contrastRatio(tokenIn(DARK_BLOCK, token), darkSurface);
      return light >= AA_NORMAL_TEXT && dark >= AA_NORMAL_TEXT
        ? []
        : [`--${token}: light ${light.toFixed(2)}:1, dark ${dark.toFixed(2)}:1`];
    });
    expect(failures, `Tokens failing AA in at least one theme:\n${failures.join('\n')}`).toEqual(
      [],
    );
  });
});

/**
 * Guards that `blockAfter` still points where it used to.
 *
 * The hardening above (strip comments, then anchor on a rule start) shifts every
 * offset in the file. A helper that silently changed target would keep the whole
 * suite green while asserting things about the wrong block — the exact failure
 * mode the hardening exists to prevent, reintroduced by the fix. One witness
 * value per historical block is enough: both are pinned elsewhere by
 * `globals-tokens.test.ts`, so a real edit is caught there, and a wrong-block
 * read is caught here.
 */
describe('blockAfter() — the hardened helper still resolves the historical blocks', () => {
  it('@theme is the light set', () => {
    expect(tokenIn(THEME_BLOCK, 'color-card')).toBe('#ffffff');
    expect(tokenIn(THEME_BLOCK, 'color-accent-600')).toBe('#8b6914');
  });

  it("[data-theme='dark'] is the dark set, not the sentence naming it inside @theme", () => {
    expect(tokenIn(DARK_BLOCK, 'color-card')).toBe('#111a2e');
    expect(tokenIn(DARK_BLOCK, 'color-accent-text')).toBe('#d4a017');
  });

  it('an unanchored marker is refused rather than matched mid-selector', () => {
    // `.mkt-paper` occurs only inside larger selectors, never starting a rule.
    expect(() => blockAfter('.mkt-paper')).toThrow(/No rule starts with this marker/);
  });
});

/**
 * La direction « Le relevé corrigé » EST le mode clair du produit.
 *
 * Elle a vécu six mois dans une portée `.mkt-paper` réservée à la vitrine
 * (ADR-039). Le 23 août 2026 cette portée a été supprimée et ses six pigments
 * sont devenus les valeurs claires de `@theme` — cf. l'addendum d'ADR-039.
 *
 * Ce que ce bloc prouve, et qui a changé de nature avec la suppression : il ne
 * vérifie plus qu'une SUBSTITUTION est correctement câblée, il vérifie que le
 * mode clair réel est lisible. C'est une assertion plus simple ET plus forte :
 * elle porte sur ce que chaque écran rend, plus seulement sur la landing.
 *
 * L'ancre de valeurs ci-dessous est ce qui empêche un retour silencieux au
 * slate. Sans elle, remettre `#f8fafc` laisserait toute la suite au vert : le
 * slate passe AA lui aussi. Un contraste ne sait pas dire quelle palette on
 * voulait.
 */
describe('globals.css — le mode clair porte la direction « Le relevé corrigé »', () => {
  /**
   * Les valeurs de la maquette Fable du 8 août 2026, littérales.
   *
   * Écrites en dur ici À DESSEIN, contrairement à tout le reste du fichier :
   * c'est le seul endroit qui doit refuser une valeur PARCE QU'ELLE A CHANGÉ,
   * pas parce qu'elle est illisible.
   */
  const DIRECTION_A = {
    'color-background': '#faf9f6',
    'color-foreground': '#171d26',
    'color-muted-foreground': '#3d4a5c',
    'color-border': '#e7e4dc',
    'color-surface-soft': '#fbfaf7',
    'color-surface-muted': '#f3f1ea',
  } as const;

  describe('les valeurs de la direction, telles quelles', () => {
    it.each(Object.entries(DIRECTION_A))('--%s vaut %s en mode clair', (token, attendu) => {
      expect(tokenIn(THEME_BLOCK, token)).toBe(attendu);
    });
  });

  it('la portée .mkt-paper ne remappe plus AUCUNE variable', () => {
    // Elle survit uniquement comme lien de mise en page (PR L2). Le jour où une
    // règle y redéclare une variable, deux vocabulaires de couleur coexistent à
    // nouveau — c'est exactement ce que la suppression a coûté un chantier à
    // défaire.
    const regles = [...css.matchAll(/([^{}]*\.mkt-paper[^{}]*)\{([^{}]*)\}/g)]
      .filter((m) => /--[\w-]+\s*:/.test(m[2] ?? ''))
      .map((m) => (m[1] ?? '').trim());
    expect(regles, `.mkt-paper redéclare des variables : ${regles.join(' | ')}`).toEqual([]);
  });

  it('le mode sombre garde son navy et n’emprunte rien au papier', () => {
    // « Pas de papier la nuit » : la maquette appelle ce fond « Nuit — navy
    // existant », donc le sombre parlait déjà la direction B avant tout ceci.
    expect(tokenIn(DARK_BLOCK, 'color-background')).toBe('#0b1120');
    for (const valeur of Object.values(DIRECTION_A)) {
      expect(DARK_BLOCK, `la valeur claire ${valeur} apparaît dans le bloc sombre`).not.toContain(
        valeur,
      );
    }
  });

  /**
   * Les paires que le mode clair rend réellement.
   *
   * Elles étaient calculées à travers la portée, ce qui exigeait un résolveur
   * (`underPaper`) et sa mise en garde : mesurer deux pigments qui se trouvent
   * lisibles ensemble ne dit rien de quel token sémantique pointe sur lequel.
   * Ce risque disparaît avec la portée — un token clair EST sa valeur.
   */
  describe('les paires du mode clair', () => {
    it.each([
      ['texte courant sur la page', 'color-foreground', 'color-background'],
      ['texte secondaire sur la page', 'color-muted-foreground', 'color-background'],
      ['texte de marque appuyé sur la page', 'color-brand-text-strong', 'color-background'],
      ['texte laiton sur la page', 'color-accent-text', 'color-background'],
      ['texte courant sur une surface douce', 'color-foreground', 'color-surface-soft'],
      ['texte courant sur une surface atténuée', 'color-foreground', 'color-surface-muted'],
      [
        'texte secondaire sur une surface atténuée',
        'color-muted-foreground',
        'color-surface-muted',
      ],
      ['texte courant sur une carte', 'color-foreground', 'color-card'],
      ['texte secondaire sur une carte', 'color-muted-foreground', 'color-card'],
    ] as const)('%s passe AA 4.5:1', (_label, fg, bg) => {
      const [f, b] = [tokenIn(THEME_BLOCK, fg), tokenIn(THEME_BLOCK, bg)];
      const ratio = contrastRatio(f, b);
      expect(
        ratio,
        `--${fg} (${f}) sur --${bg} (${b}) → ${ratio.toFixed(2)}:1, sous AA ${AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it('garde les deux surfaces élevées dans leur ordre', () => {
      // Un test de contraste ne peut pas voir ceci, et c'est tout l'intérêt :
      // échanger les deux teintes inverse l'élévation de chaque panneau pendant
      // que tous les ratios restent confortablement AA — les deux papiers sont
      // voisins. On affirme l'ORDRE, qui est la règle de conception, pas la
      // correspondance, qui ne serait qu'un miroir du CSS.
      expect(
        luminance(tokenIn(THEME_BLOCK, 'color-surface-soft')),
        'surface-soft doit rester plus claire que surface-muted',
      ).toBeGreaterThan(luminance(tokenIn(THEME_BLOCK, 'color-surface-muted')));
    });

    it('le texte secondaire gagne au change plutôt qu’il ne perd', () => {
      // Le seul argument chiffré de la descente : sur le slate, le secondaire
      // valait 7,24:1 ; sur le papier il vaut 8,55. Un chiffre PLANCHER, pas la
      // valeur exacte — cette assertion doit survivre à un ajustement de teinte,
      // et échouer si quelqu'un redescend sous l'état d'avant.
      const ratio = contrastRatio(
        tokenIn(THEME_BLOCK, 'color-muted-foreground'),
        tokenIn(THEME_BLOCK, 'color-background'),
      );
      expect(ratio, `texte secondaire à ${ratio.toFixed(2)}:1`).toBeGreaterThan(7.24);
    });

    it('l’appel à l’action principal reste lisible', () => {
      expect(
        contrastRatio(tokenIn(THEME_BLOCK, 'color-card'), tokenIn(THEME_BLOCK, 'color-brand-700')),
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });

  /**
   * Les quatre couleurs d'état ne bougent pas, mais le fond de page SI — et un
   * message d'état n'est pas toujours dans une carte. `--color-danger` est celle
   * à surveiller : 4,59 sur le papier, soit 0,09 au-dessus de la barre. Tout
   * assombrissement du papier la fait passer dessous.
   */
  describe('les couleurs d’état sur le fond de page clair', () => {
    it.each(STATUS_TOKENS)('--%s passe AA 4.5:1', (token) => {
      const value = tokenIn(THEME_BLOCK, token);
      const bg = tokenIn(THEME_BLOCK, 'color-background');
      const ratio = contrastRatio(value, bg);
      expect(
        ratio,
        `--${token} vaut ${value} sur ${bg} → ${ratio.toFixed(2)}:1, sous AA ${AA_NORMAL_TEXT}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });
});

/**
 * Distance perceptuelle en OKLab ×100.
 *
 * Le ratio de contraste répond à « peut-on lire ceci sur cela » ; il ne répond
 * pas à « peut-on distinguer ces deux-ci l'un de l'autre ». Deux teintes de même
 * clarté et de teintes opposées ont un ratio de 1,0 entre elles tout en passant
 * chacune AA sur la même carte. C'est exactement le défaut que ce fichier
 * raconte plus haut : une décision de couleur sans test de séparation a laissé
 * une paire tomber à 1,03 sans que rien ne bronche.
 *
 * OKLab plutôt que la distance RGB, qui n'a aucun rapport avec la perception.
 */
function oklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function deltaE(a: string, b: string): number {
  const [p, q] = [oklab(a), oklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
}

/** WCAG 2.2 §1.4.11 — objet graphique, seuil plus bas que celui du texte. */
const AA_GRAPHIC_OBJECT = 3;

/**
 * Plancher de séparation de la rampe, mesuré puis arrondi vers le bas.
 *
 * Valeurs relevées à la conception : 13,1 en clair, 12,8 en sombre. Le plancher
 * est posé à 12 — assez près pour qu'une retouche de teinte le franchisse et
 * fasse rougir, assez loin pour qu'un arrondi de rendu ne le déclenche pas.
 *
 * Il est **sous** la cible de 15 souvent citée pour la vision normale, et c'est
 * assumé : la lisibilité de l'anneau ne repose pas sur la seule couleur — les
 * arcs sont séparés par un écart de fond, ils sont six au maximum, et la légende
 * porte libellé, montant et part. Le chiffre est écrit tel qu'il est plutôt
 * qu'ajusté jusqu'à ce qu'un seuil s'allume.
 */
const MIN_GRAPH_SEPARATION = 12;

/** Les quatre surfaces sur lesquelles une donnée peut se poser. */
const SURFACE_TOKENS = [
  'color-background',
  'color-surface-soft',
  'color-card',
  'color-surface-muted',
] as const;

const GRAPH_TOKENS = [
  'color-graph-1',
  'color-graph-2',
  'color-graph-3',
  'color-graph-4',
  'color-graph-5',
  'color-graph-6',
  'color-graph-rest',
] as const;

/**
 * Les teintes que `MonthCurve` pose en `stroke`, et pourquoi elles ont leur
 * propre contrôle.
 *
 * La rampe ci-dessus couvre les jetons **catégoriels** — ceux d'un anneau de
 * répartition. Les traits de la courbe du mois viennent d'ailleurs : trois
 * teintes d'ÉTAT plus une neutre pour la référence de rythme. Rien ne les
 * vérifiait, et le trou a coûté exactement ce qu'un trou coûte.
 *
 * **Mesuré le 24 août 2026** : la première version prenait `--color-brand-500`
 * (#14b8a6) pour l'état « dans le rythme ». Sur une carte blanche : **2,49:1**,
 * sous les 3:1 de WCAG 1.4.11. Et c'était l'état par DÉFAUT — le tracé du mois
 * où tout va bien était le moins lisible des trois. `brand-500` est un pas de
 * palette sans override sombre ; `--color-brand-text` est la teinte de marque
 * garantie lisible sur la surface, définie dans les deux thèmes.
 *
 * Les quatre surfaces et pas seulement la carte : la courbe vit dans un `Card`
 * aujourd'hui, et un seuil mesuré sur la seule surface qu'on croit utiliser
 * n'est pas un seuil.
 */
const CURVE_STROKE_TOKENS = [
  'color-brand-text',
  'color-warning',
  'color-danger',
  'color-muted-foreground',
] as const;

const THEMES = [
  ['clair', THEME_BLOCK],
  ['sombre', DARK_BLOCK],
] as const;

describe('globals.css — les traits de la courbe du mois (PR 1)', () => {
  describe.each(THEMES)('mode %s', (_theme, block) => {
    it.each(CURVE_STROKE_TOKENS)('--%s tient 3:1 sur les QUATRE surfaces', (token) => {
      const value = tokenIn(block, token);
      for (const surface of SURFACE_TOKENS) {
        const bg = tokenIn(block, surface);
        const ratio = contrastRatio(value, bg);
        expect(
          ratio,
          `--${token} (${value}) sur --${surface} (${bg}) → ${ratio.toFixed(2)}:1, sous ${AA_GRAPHIC_OBJECT}:1`,
        ).toBeGreaterThanOrEqual(AA_GRAPHIC_OBJECT);
      }
    });
  });

  it('refuse un pas de palette sans override sombre', () => {
    // Le défaut de fond n'était pas la valeur, c'était la NATURE du jeton : un
    // pas de palette porte une teinte, pas une garantie de lisibilité, et sans
    // override il vaut la même chose sur une carte blanche et sur une carte de
    // nuit. Ce cas nomme la classe plutôt que l'instance.
    for (const token of CURVE_STROKE_TOKENS) {
      expect(
        DARK_BLOCK,
        `--${token} n'a pas d'override sombre : une seule valeur ne peut pas tenir sur les deux surfaces`,
      ).toMatch(new RegExp(`--${token}:\\s*#[0-9a-fA-F]{6}`));
    }
  });
});

describe('globals.css — la rampe graphique et l’échelle d’élévation (PR 0)', () => {
  describe.each(THEMES)('mode %s', (_theme, block) => {
    it.each(GRAPH_TOKENS)('--%s tient 3:1 sur les QUATRE surfaces', (token) => {
      // Les quatre, pas les trois « où un arc se pose » : un seuil mesuré sur
      // les seules surfaces qu'on croit utiliser n'est pas un seuil, et la
      // première version de ce chantier a annoncé 4,13 au lieu de 3,85 pour
      // avoir oublié `surface-muted`.
      const value = tokenIn(block, token);
      for (const surface of SURFACE_TOKENS) {
        const bg = tokenIn(block, surface);
        const ratio = contrastRatio(value, bg);
        expect(
          ratio,
          `--${token} (${value}) sur --${surface} (${bg}) → ${ratio.toFixed(2)}:1, sous ${AA_GRAPHIC_OBJECT}:1`,
        ).toBeGreaterThanOrEqual(AA_GRAPHIC_OBJECT);
      }
    });

    it('garde ses sept teintes distinguables deux à deux', () => {
      const echecs: string[] = [];
      for (let i = 0; i < GRAPH_TOKENS.length; i++) {
        for (let j = i + 1; j < GRAPH_TOKENS.length; j++) {
          const [a, b] = [GRAPH_TOKENS[i]!, GRAPH_TOKENS[j]!];
          const d = deltaE(tokenIn(block, a), tokenIn(block, b));
          if (d < MIN_GRAPH_SEPARATION) {
            echecs.push(`--${a} / --${b} → dE ${d.toFixed(1)}`);
          }
        }
      }
      expect(
        echecs,
        `paires sous le plancher ${MIN_GRAPH_SEPARATION} : ${echecs.join(', ')}`,
      ).toEqual([]);
    });

    it('range ses quatre surfaces dans l’ordre d’élévation', () => {
      // Le même ordre dans les deux thèmes, et ce n'est pas un hasard :
      // `surface-muted` est un fond de PISTE, sous un curseur qui porte
      // `bg-card` (`LocaleSwitcher`), et sous les rainures de `progress`,
      // `PaceBar` et `AllocationBar`. Une piste plus claire que son curseur se
      // lirait à l'envers — donc « muted » descend, dans les deux thèmes, même
      // si en mode sombre l'intuition voudrait qu'on s'écarte du fond vers le
      // haut.
      const lums = SURFACE_TOKENS.map((t) => [t, luminance(tokenIn(block, t))] as const);
      const attendu = [
        'color-surface-muted',
        'color-background',
        'color-surface-soft',
        'color-card',
      ];
      const observe = [...lums].sort((a, b) => a[1] - b[1]).map(([t]) => t);
      expect(observe, `ordre observé : ${observe.join(' < ')}`).toEqual(attendu);
    });

    it('donne aux quatre surfaces quatre valeurs distinctes', () => {
      // En sombre, `surface-soft` et `surface-muted` ont porté la MÊME valeur
      // jusqu'au 24 août 2026 : trois crans d'élévation pour quatre jetons.
      // C'est la cause mesurable de la platitude du cockpit dans ce thème, où
      // l'ombre ne se voit pas et où seule la surface peut élever.
      const valeurs = SURFACE_TOKENS.map((t) => tokenIn(block, t));
      expect(new Set(valeurs).size, `valeurs : ${valeurs.join(', ')}`).toBe(SURFACE_TOKENS.length);
    });

    it.each(['color-foreground', 'color-muted-foreground'] as const)(
      '--%s passe AA 4.5:1 sur les quatre surfaces',
      (token) => {
        const value = tokenIn(block, token);
        for (const surface of SURFACE_TOKENS) {
          const bg = tokenIn(block, surface);
          const ratio = contrastRatio(value, bg);
          expect(
            ratio,
            `--${token} (${value}) sur --${surface} (${bg}) → ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        }
      },
    );
  });

  it('déclare la rampe dans les DEUX blocs, jamais héritée', () => {
    // Un jeton non redéclaré garde sa valeur claire sur fond de nuit. Rien ne
    // l'interdit aujourd'hui : `DIRECTION_A` ne couvre que six jetons de
    // surface et de texte, aucun de rampe.
    for (const token of GRAPH_TOKENS) {
      expect(tokenIn(THEME_BLOCK, token)).toMatch(/^#[0-9a-f]{6}$/i);
      expect(tokenIn(DARK_BLOCK, token)).toMatch(/^#[0-9a-f]{6}$/i);
      expect(
        tokenIn(DARK_BLOCK, token),
        `--${token} porte la même valeur dans les deux thèmes`,
      ).not.toBe(tokenIn(THEME_BLOCK, token));
    }
  });

  it('n’emprunte aucune valeur aux jetons d’état', () => {
    // La rampe n'a pas à FUIR les couleurs d'état — cette contrainte-là s'est
    // révélée insatisfiable à la mesure, et elle excluait tout orange. Elle doit
    // en revanche ne jamais en RÉUTILISER une : sans quoi retoucher
    // `--color-warning` demain repeindrait des catégories, en silence.
    for (const [, block] of THEMES) {
      const etats = STATUS_TOKENS.map((t) => tokenIn(block, t));
      for (const token of GRAPH_TOKENS) {
        expect(etats, `--${token} réutilise une couleur d’état`).not.toContain(
          tokenIn(block, token),
        );
      }
    }
  });
});
