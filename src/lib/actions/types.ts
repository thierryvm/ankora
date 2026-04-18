export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | {
      ok: false;
      errorCode: string;
      fieldErrors?: Record<string, string[]>;
    };
