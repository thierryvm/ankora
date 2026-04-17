<!--
Thanks for contributing to Ankora!
Fill in each section. Keep it concise.
-->

## Summary

<!-- One-paragraph description of what this PR does and why. -->

Closes #

## Type of change

- [ ] feat — new user-facing feature
- [ ] fix — bug fix
- [ ] refactor — no behavior change
- [ ] perf — performance improvement
- [ ] test — tests only
- [ ] docs — documentation only
- [ ] chore — deps / CI / tooling
- [ ] security — security fix (link the advisory)

## Scope

<!-- Which domain? e.g., auth, dashboard, onboarding, gdpr, pwa, domain/budget -->

## Screenshots / recordings

<!-- Required for any UI change. Before/after side-by-side if possible. -->

## Quality gates

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] `npm run e2e` passes (if e2e relevant)
- [ ] Lighthouse score unchanged or improved (if UI relevant)
- [ ] No new `console.*` in production code paths
- [ ] No new `any` / `@ts-ignore` / `eslint-disable`

## Security & privacy checklist

- [ ] No secret committed (verify via `git diff`)
- [ ] All Server Actions parse input with Zod **before** any logic
- [ ] No trusting of client-provided `userId` / `workspaceId`
- [ ] Sensitive actions emit `logAuditEvent()`
- [ ] Rate-limit applied to public endpoints, mutations, exports
- [ ] If touching auth / middleware / RLS: `security-auditor` agent has been run
- [ ] If touching PII / cookies / export / deletion: `gdpr-compliance-auditor` agent has been run
- [ ] If touching migrations / RLS policies: `rls-flow-tester` agent has been run

## Breaking changes

<!-- List any migration steps for consumers or ops. Put "None" if none. -->

## Post-merge actions

<!-- e.g., run a Supabase migration, rotate a secret, update env vars on Vercel. Put "None" if none. -->

---

<sub>By submitting this PR, you confirm you have read and agree to the [Code of Conduct](../CODE_OF_CONDUCT.md) and [Contributing guidelines](../CONTRIBUTING.md).</sub>
