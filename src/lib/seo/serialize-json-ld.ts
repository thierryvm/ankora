/**
 * Serialises a JSON-LD payload for a `<script type="application/ld+json">`.
 *
 * `JSON.stringify` does not escape `<`: a value spelling `</script>` (a
 * translation, a future user-facing field) would close the script element and
 * let the rest of the string be parsed as HTML. Replacing every `<` with its
 * JSON unicode escape keeps the payload byte-for-byte equivalent for any JSON
 * reader while making it inert for the HTML parser. This is the form the
 * Next.js JSON-LD guide recommends.
 */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
