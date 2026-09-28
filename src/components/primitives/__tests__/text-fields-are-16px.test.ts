// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, it, expect } from 'vitest';

/**
 * Every field a person types into renders its text at 16 px or more.
 *
 * iOS Safari zooms the page in when a field whose text is under 16 px takes the
 * focus, and does not zoom back out when the field is left. Reported on a phone
 * on 28 September 2026: after closing the « Nouvelle dépense » sheet the page
 * « still moves sideways, as if it had been zoomed ». Four fields of that sheet
 * were `text-sm` (14 px).
 *
 * The fix is never to block zoom (`maximum-scale`, `user-scalable=no`): that is
 * an accessibility rule. It is to size the fields.
 *
 * This test reads the source rather than a render because the rule is about
 * EVERY field in the app, including the ones no unit test mounts. It lists the
 * offenders by file and line, so a failure names what to fix.
 *
 * Accepted proofs of 16 px, all literal (see `globals.css` for why a
 * `var()`-based utility is not trusted on WebKit):
 *   - `ankora-form-control-16` — the field primitives (`Input`, `SelectTrigger`),
 *     which also carry their own focus edge;
 *   - `ankora-text-16` — the size alone, for fields that keep the global focus
 *     outline (borderless fields inside a tinted row);
 *   - an arbitrary pixel size of 16 or more (the 40 px amount).
 */

const SRC = fileURLToPath(new URL('../../../', import.meta.url));

/** Input types that show no typed text, so no zoom. */
const NON_TEXT_TYPES = new Set([
  'radio',
  'checkbox',
  'hidden',
  'range',
  'color',
  'file',
  'submit',
  'button',
  'reset',
  'image',
]);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : tsxFiles(full);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [full] : [];
  });
}

function isSixteenOrMore(classText: string): boolean {
  if (/\bankora-form-control-16\b|\bankora-text-16\b/.test(classText)) return true;
  return [...classText.matchAll(/text-\[(\d+)px\]/g)].some((m) => Number(m[1]) >= 16);
}

type Field = { where: string; tag: string; classText: string };

function fieldsOf(file: string): Field[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  // `className={SELECT_CLASS}`: a constant of the same file counts as its text.
  const constants = new Map<string, string>();
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      constants.set(node.name.text, node.initializer.getText(source));
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  const resolve = (text: string, depth = 0): string =>
    depth > 3
      ? text
      : [
          text,
          ...[...text.matchAll(/\b[A-Za-z_]\w*\b/g)].map((m) => {
            const constant = constants.get(m[0]);
            return constant === undefined ? '' : resolve(constant, depth + 1);
          }),
        ].join(' ');
  const found: Field[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const attr = (name: string) => attrs.find((a) => a.name.getText(source) === name);
        const type = attr('type')?.initializer;
        const typeText = type && ts.isStringLiteral(type) ? type.text : 'text';
        if (tag !== 'input' || !NON_TEXT_TYPES.has(typeText)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          found.push({
            where: `${relative(SRC, file).replaceAll('\\', '/')}:${line}`,
            tag,
            classText: resolve(attr('className')?.initializer?.getText(source) ?? ''),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('every text field is 16 px or more (iOS Safari auto-zoom)', () => {
  const fields = tsxFiles(SRC).flatMap(fieldsOf);

  it('finds the fields it is meant to guard — a scan that sees nothing proves nothing', () => {
    const places = fields.map((f) => f.where);
    expect(places.some((p) => p.startsWith('components/expenses/AddExpenseSheet.tsx'))).toBe(true);
    expect(places.some((p) => p.startsWith('components/ui/input.tsx'))).toBe(true);
    expect(fields.some((f) => f.tag === 'textarea')).toBe(true);
    expect(fields.some((f) => f.tag === 'select')).toBe(true);
  });

  it('no field renders its text under 16 px', () => {
    const offenders = fields
      .filter((f) => !isSixteenOrMore(f.classText))
      .map((f) => `${f.where} <${f.tag}>`);
    expect(offenders).toEqual([]);
  });
});
