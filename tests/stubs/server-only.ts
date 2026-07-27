// Vitest stand-in for the `server-only` marker package.
//
// That package resolves to an empty module under React's `react-server`
// condition and to one that THROWS everywhere else — which is exactly its job
// in a Next build, and exactly what breaks any unit test importing a module
// that carries the marker. Aliased in vitest.config.ts so no individual suite
// has to remember `vi.mock('server-only')`.
//
// `export {}` is required: with `isolatedModules`, a file without an export is
// treated as a global script rather than a module.
export {};
