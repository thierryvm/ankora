# How to Add a Glossary Term

1. **Add the term to all 3 JSON files** in `content/glossary/{locale}.json`:
   - Use lowercase hyphens for the slug (e.g., `budget-de-lissage`)
   - Include: `slug`, `term`, `shortDefinition`, `whyItMatters`, `example`, `relatedTerms[]`
   - Use **French slugs** in `relatedTerms` across all locales

2. **Update i18n messages** if you introduce new section labels in `messages/{locale}.json`

3. **Test locally**:

   ```bash
   npm run test              # validates 15 terms + no dangling references
   npm run typecheck         # ensures type safety
   npm run build             # confirms static generation works
   ```

4. **Verify**:
   - `/glossaire` index renders your term
   - `/glossaire/{slug}` detail page loads
   - Related links point to existing terms
