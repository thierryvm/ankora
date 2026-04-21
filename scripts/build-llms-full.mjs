#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const messagesDir = path.join(rootDir, 'messages');
const contentDir = path.join(rootDir, 'content');

// Load llms.txt header (template for full version)
const llmsHeader = fs.readFileSync(path.join(publicDir, 'llms.txt'), 'utf-8');

// Load messages to extract landing + FAQ content
const messages = JSON.parse(fs.readFileSync(path.join(messagesDir, 'fr-BE.json'), 'utf-8'));

// Load glossary terms (fail fast if missing)
let glossaryTerms = [];
try {
  const glossaryData = JSON.parse(
    fs.readFileSync(path.join(contentDir, 'glossary', 'fr-BE.json'), 'utf-8'),
  );
  glossaryTerms = Object.values(glossaryData);
} catch (err) {
  throw new Error(`Failed to load glossary from content/glossary/fr-BE.json: ${err.message}`);
}

// Fail fast if FAQ data is missing
if (!messages.faq?.items) {
  throw new Error('FAQ data not found in messages.faq.items');
}

const timestamp = new Date().toISOString().split('T')[0];
const glossaryCount = glossaryTerms.length;

const llmsFullContent = `# ankora.be — Full content export for LLMs

Last generated: ${timestamp}
Canonical URL: https://ankora.be
License: content available for citation with attribution. Code is proprietary.

## Table of contents

1. About Ankora
2. Methodology: smoothed budgets and bucket accounts
3. Glossary (${glossaryCount} terms)
4. FAQ
5. Legal and data handling

---

## 1. About Ankora

Ankora is a Belgian personal-finance app that converts irregular yearly charges into predictable monthly contributions and organises savings into goal-labelled bucket accounts. It operates outside the PSD2 open-banking framework by design: users enter or import data manually, and the app never reads bank transactions directly.

${llmsHeader}

## 2. Methodology

${messages.landing?.methodologySection || '[Methodology section from landing page]'}

### Smoothed budget technique

${messages.glossary?.['smoothed-budget'] || 'Converting irregular annual charges into monthly contributions.'}

## 3. Glossary

${glossaryTerms
  .slice(0, glossaryCount)
  .map((term) => `### ${term.term}\n\n${term.shortDefinition}`)
  .join('\n\n')}

## 4. FAQ

${Object.entries(messages.faq.items)
  .map(([, item]) => `### Q: ${item.q}\n\n${item.a}`)
  .join('\n\n')}

## 5. Legal and data handling

### Privacy

For full privacy policy, see: https://ankora.be/legal/privacy

### Terms of Service

For full terms, see: https://ankora.be/legal/cgu

### Cookies

For detailed cookie policy, see: https://ankora.be/legal/cookies

---

**Note:** This is a v1 skeleton. For full automation (including complete glossary export and legal summaries), see the follow-up ticket: "chore(seo): enrich llms-full.txt with full content exports"
`;

fs.writeFileSync(path.join(publicDir, 'llms-full.txt'), llmsFullContent);

const stats = fs.statSync(path.join(publicDir, 'llms-full.txt'));
console.log(`✓ Generated llms-full.txt (${stats.size} bytes, ${glossaryCount} glossary terms)`);

if (stats.size < 2000) {
  console.warn(
    `⚠ Warning: llms-full.txt is only ${stats.size} bytes; ensure all content blocks are populated.`,
  );
}
