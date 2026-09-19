# ADR-044 — Audience measurement stays on consent

- **Status**: accepted, 19 September 2026
- **Decided by**: the pilot, on a delegation from @thierry (who reviews this on his return)
- **Supersedes**: the decision of 18 September 2026 to load audience measurement without consent

## Context

Vercel Web Analytics and Vercel Speed Insights are loaded only after the visitor accepts
(`ConsentGatedAnalytics`). As a result the traffic figures only count people who accepted, and a
first-time visitor who leaves without answering is invisible.

On 18 September 2026 the decision was taken to load both tools for every visitor who does not
object, on the basis of legitimate interest (GDPR Art. 6(1)(f)), and to remove the consent banner.
The reasoning was that neither tool sets a cookie.

## Why that decision is withdrawn

The absence of a cookie is not the test. Article 5(3) of the ePrivacy Directive covers storing
**or accessing** information on the user's device, whatever the technique. The EDPB Guidelines
2/2023 on the technical scope of Art. 5(3) (final version adopted on 16 October 2024) apply it to
cookieless techniques, including a script sent to the browser that reads device information to
count a visit. Consent is then required unless an exemption applies. Legitimate interest under
the GDPR does not replace it.

Some authorities publish an exemption for audience measurement (the CNIL does). Belgium has none
that we know of. The privacy policy already states what the tool reads: "the technical
characteristics of your device and browser".

- EDPB Guidelines 2/2023, v2: <https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf>

## Decision

- Consent remains the legal basis for audience measurement. The privacy policy (version 2.0.0)
  already says so, and stays true.
- The banner stays, reshaped: a thin bar **in the page flow**, above the content, so it can
  never cover a call to action (a bar fixed to the bottom covers whatever scrolls to the bottom
  edge). Refusing and accepting are two buttons of the same size.
- The "customise" panel and the marketing box are removed: no marketing tracker exists. The
  stored format and the server records keep a `marketing: false` field, unchanged.

## The way to measure without consent, later

A count made **on the server**, in the proxy: path, day and country, from the request the server
receives anyway. Nothing is read on the device and no IP address is kept. It would not fall under
Art. 5(3). To be designed in a dedicated round, with its own review.

## Consequences

- The traffic figures remain those of people who accept. Funnel events (`signup_started`,
  `signup_completed`) can only be sent for them.
- `CLAUDE.md` ("Cookie consent: bannière maison") does not change.
