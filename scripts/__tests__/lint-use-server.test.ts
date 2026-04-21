import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parse } from '@typescript-eslint/parser';

describe('lint-use-server logic', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traverse = (node: any, callback: (n: any) => void): void => {
    if (!node) return;
    callback(node);
    if (node.program) traverse(node.program, callback);
    if (node.body) {
      if (Array.isArray(node.body)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        node.body.forEach((n: any) => traverse(n, callback));
      } else {
        traverse(node.body, callback);
      }
    }
    if (node.declaration) traverse(node.declaration, callback);
  };

  it('should identify async function exports as valid', () => {
    const code = `'use server';
export async function myAction() {
  return { ok: true };
}`;

    const ast = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    });

    let foundAsync = false;
    traverse(ast, (node) => {
      if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration?.async === true && node.declaration?.type === 'FunctionDeclaration') {
          foundAsync = true;
        }
      }
    });

    expect(foundAsync).toBe(true);
  });

  it('should identify const exports as invalid in use server context', () => {
    const code = `'use server';
export const schema = {};`;

    const ast = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    });

    let foundInvalidConst = false;
    traverse(ast, (node) => {
      if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration?.type === 'VariableDeclaration') {
          foundInvalidConst = true;
        }
      }
    });

    expect(foundInvalidConst).toBe(true);
  });

  it('should detect type exports as invalid in use server context', () => {
    const code = `'use server';
export type MyType = { id: string };`;

    const ast = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    });

    let foundTypeExport = false;
    traverse(ast, (node) => {
      if (
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'TSTypeAliasDeclaration'
      ) {
        foundTypeExport = true;
      }
    });

    expect(foundTypeExport).toBe(true);
  });

  it('should identify sync function exports as invalid', () => {
    const code = `'use server';
export function syncAction() {
  return { ok: true };
}`;

    const ast = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    });

    let foundSyncFunction = false;
    traverse(ast, (node) => {
      if (node.type === 'ExportNamedDeclaration') {
        const isFunctionDecl = node.declaration?.type === 'FunctionDeclaration';
        const isAsync = node.declaration?.async === true;
        if (isFunctionDecl && !isAsync) {
          foundSyncFunction = true;
        }
      }
    });

    expect(foundSyncFunction).toBe(true);
  });

  it('should detect use server directive correctly', () => {
    const goodCode = `'use server';
export async function action() {}`;

    const badCode = `export async function action() {}`;

    const hasUseServer = (code: string): boolean => {
      const lines = code.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('//')) continue;
        return (
          trimmed === "'use server'" ||
          trimmed === '"use server"' ||
          trimmed === "'use server';" ||
          trimmed === '"use server";'
        );
      }
      return false;
    };

    expect(hasUseServer(goodCode)).toBe(true);
    expect(hasUseServer(badCode)).toBe(false);
  });

  it('should handle mixed valid and invalid exports', () => {
    const code = `'use server';
export async function validAction() {}
export const invalidConst = {};
export type InvalidType = {};`;

    const ast = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    });

    const exports = { valid: 0, invalid: 0 };
    traverse(ast, (node) => {
      if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration?.async && node.declaration?.type === 'FunctionDeclaration') {
          exports.valid++;
        } else if (
          node.declaration?.type === 'VariableDeclaration' ||
          node.declaration?.type === 'TSTypeAliasDeclaration'
        ) {
          exports.invalid++;
        }
      }
    });

    expect(exports.valid).toBe(1);
    expect(exports.invalid).toBe(2);
  });

  it('should correctly parse real auth.ts file structure', () => {
    const authTsPath = path.join(process.cwd(), 'src/lib/actions/auth.ts');
    if (fs.existsSync(authTsPath)) {
      const content = fs.readFileSync(authTsPath, 'utf-8');
      const ast = parse(content, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      });

      let asyncFunctionCount = 0;
      traverse(ast, (node) => {
        if (node.type === 'ExportNamedDeclaration') {
          if (
            node.declaration?.async === true &&
            node.declaration?.type === 'FunctionDeclaration'
          ) {
            asyncFunctionCount++;
          }
        }
      });

      expect(asyncFunctionCount).toBeGreaterThan(0);
    }
  });
});
