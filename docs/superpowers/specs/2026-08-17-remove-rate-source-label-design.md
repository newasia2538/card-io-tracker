# Remove exchange-rate source labels

## Scope

Remove visible `Source: Frankfurter` text from the USD price preview and the
summary exchange-rate metadata. Keep exchange-rate fetching, rate dates,
cached-rate status, persistence, and API payloads unchanged.

## Verification

- Form and summary tests assert source text is absent.
- Existing rate, cached-rate, build, and PWA behavior remains green.
- Local app is refreshed after the patch.
