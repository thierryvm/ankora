import { z } from 'zod';

type WithoutDefault<T> =
  T extends z.ZodDefault<infer Inner> ? Inner : T extends z.ZodPrefault<infer Inner> ? Inner : T;

type ShapeWithoutDefaults<S extends z.ZodRawShape> = { [K in keyof S]: WithoutDefault<S[K]> };

/**
 * The PATCH variant of a create schema: every field optional, and no field
 * ever filled in by a default.
 *
 * Plain `.partial()` is not enough under Zod 4: it wraps each field in
 * `optional` but keeps its `.default()`, so a key the caller never sent comes
 * back out of the parse with the create default. Every update action writes
 * what is `!== undefined`, so that default reached the database — editing a
 * label reset the columns the caller had not touched.
 *
 * The create schema keeps its defaults; only the patch drops them. An explicit
 * value (including `null` where the field accepts it) still passes and is
 * still validated by the same rules.
 */
export function partialWithoutDefaults<S extends z.ZodRawShape>(schema: z.ZodObject<S>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [
      key,
      field instanceof z.ZodDefault || field instanceof z.ZodPrefault ? field.unwrap() : field,
    ]),
  ) as ShapeWithoutDefaults<S>;

  // `extend` keeps the source object's config (strict, catchall), which a
  // fresh `z.object(shape)` would silently drop.
  const patch = schema.extend(shape).partial();

  // A default nested under another wrapper (e.g. `.default(x).nullable()`) is
  // not unwrapped above and would still fill an absent key. Throw when the
  // module loads rather than let such a patch schema write silently.
  const probe = patch.safeParse({});
  if (!probe.success || Object.keys(probe.data).length > 0) {
    throw new Error(
      `partialWithoutDefaults: an empty patch must parse to {} — got ${JSON.stringify(
        probe.success ? probe.data : probe.error.issues,
      )}`,
    );
  }

  return patch;
}
