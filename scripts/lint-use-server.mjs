import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from '@typescript-eslint/parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const violations = [];

function findFiles(dir, pattern) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && !item.name.startsWith('.')) {
        files.push(...findFiles(fullPath, pattern));
      }
    } else if (pattern.test(item.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = findFiles(path.join(projectRoot, 'src'), /\.(ts|tsx)$/).map((f) =>
  path.relative(projectRoot, f),
);

for (const file of files) {
  const filePath = path.join(projectRoot, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let useServerFound = false;
  let useServerLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('//')) continue;
    if (
      trimmed === "'use server'" ||
      trimmed === '"use server"' ||
      trimmed === "'use server';" ||
      trimmed === '"use server";'
    ) {
      useServerFound = true;
      useServerLine = i + 1;
      break;
    }
    if (!trimmed.startsWith('import') && !trimmed.startsWith('export') && trimmed !== '') {
      break;
    }
  }

  if (!useServerFound) continue;

  try {
    const ast = parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    });

    const exports = [];
    const traverse = (node) => {
      if (!node) return;
      if (node.type === 'ExportNamedDeclaration') {
        const isAsync = node.declaration?.async === true;
        const isFunctionDecl = node.declaration?.type === 'FunctionDeclaration';
        const isVariable = node.declaration?.type === 'VariableDeclaration';
        const isTypeDecl = node.declaration?.type === 'TSTypeAliasDeclaration';
        const isInterfaceDecl = node.declaration?.type === 'TSInterfaceDeclaration';

        if (isAsync && isFunctionDecl) {
          exports.push({ type: 'async-function', name: node.declaration.id.name, valid: true });
        } else if (isFunctionDecl) {
          exports.push({
            type: 'sync-function',
            name: node.declaration.id.name,
            valid: false,
            line: node.declaration.loc.start.line,
          });
        } else if (isVariable) {
          const names = node.declaration.declarations.map((d) => d.id.name);
          exports.push({
            type: 'const-or-let',
            names,
            valid: false,
            line: node.declaration.loc.start.line,
          });
        } else if (isTypeDecl || isInterfaceDecl) {
          exports.push({
            type: 'type-alias',
            name: node.declaration.id.name,
            valid: false,
            line: node.declaration.loc.start.line,
          });
        } else if (node.specifiers && node.specifiers.length > 0) {
          exports.push({
            type: 're-export',
            names: node.specifiers.map((s) => s.exported.name),
            valid: true,
          });
        }
      } else if (node.type === 'ExportDefaultDeclaration') {
        const isAsync = node.declaration?.async === true;
        const isFunctionDecl =
          node.declaration?.type === 'FunctionExpression' ||
          node.declaration?.type === 'FunctionDeclaration';

        if (isAsync && isFunctionDecl) {
          exports.push({ type: 'default-async', valid: true });
        } else {
          exports.push({
            type: 'default-non-async',
            valid: false,
            line: node.declaration?.loc?.start?.line || useServerLine,
          });
        }
      }

      if (node.body) traverse(node.body);
      if (Array.isArray(node.body)) node.body.forEach(traverse);
      if (node.program) traverse(node.program);
      if (node.declaration) traverse(node.declaration);
    };

    traverse(ast);

    const invalidExports = exports.filter((e) => !e.valid);
    for (const invalid of invalidExports) {
      if (invalid.type === 'sync-function') {
        violations.push(
          `ERROR: ${file}:${invalid.line} — non-async function "${invalid.name}" in 'use server' file`,
        );
      } else if (invalid.type === 'const-or-let') {
        violations.push(
          `ERROR: ${file}:${invalid.line} — non-async export ${invalid.names.join(', ')} in 'use server' file`,
        );
      } else if (invalid.type === 'type-alias') {
        violations.push(
          `ERROR: ${file}:${invalid.line} — type/interface "${invalid.name}" in 'use server' file`,
        );
      } else if (invalid.type === 'default-non-async') {
        violations.push(
          `ERROR: ${file}:${invalid.line} — non-async default export in 'use server' file`,
        );
      }
    }
  } catch (e) {
    console.error(`Warning: failed to parse ${file}: ${e.message}`);
  }
}

if (violations.length > 0) {
  console.error(
    `\n❌ 'use server' violations detected:\n${violations.join('\n')}\n\nFix by moving non-async exports to sibling files without 'use server' directive.`,
  );
  process.exit(1);
} else {
  console.log('✓ All "use server" files contain only async exports');
  process.exit(0);
}
