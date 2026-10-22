# Contributing to FomoPulse

Thanks for helping! Bug reports, docs fixes and features are all welcome.

## Getting set up

1. Fork and clone the repo, then `npm install`.
2. `npm run dev` connects it to your own Partner app and development store (see the README).
3. Make your change on a branch.

## Before opening a PR

```bash
npm run lint
npm run typecheck
npm test
```

- Keep the storefront script (`extensions/fomopulse-embed/assets/fomopulse.js`) dependency-free, written in ES5 syntax (no build step) and small.
- Never render feed content with `innerHTML`.
- New logic belongs in a pure module under `app/lib/`, with tests in `test/`.
- Don't store more customer data than a notification needs. Privacy changes need a clear reason in the PR.
- No features that fabricate or inflate activity.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Please don't open a public issue for vulnerabilities.

## Code of conduct

Be kind and constructive. Harassment of any kind isn't tolerated.
