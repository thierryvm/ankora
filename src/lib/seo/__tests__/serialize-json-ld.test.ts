import { describe, it, expect } from 'vitest';

import { serializeJsonLd } from '../serialize-json-ld';

describe('serializeJsonLd', () => {
  it('a value spelling </script> cannot close the script block', () => {
    const data = {
      '@type': 'Question',
      name: 'Pourquoi </script><script>alert(1)</script> ?',
      nested: { text: '<!-- comment -->' },
    };
    const out = serializeJsonLd(data);

    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c/script>');
  });

  it('round-trips: a JSON-LD reader gets the original object back', () => {
    const data = { name: 'a </script> b', list: ['<', '505 €', 'ok'] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it('leaves a payload without < unchanged', () => {
    const data = { '@context': 'https://schema.org', price: '0' };
    expect(serializeJsonLd(data)).toBe(JSON.stringify(data));
  });
});
