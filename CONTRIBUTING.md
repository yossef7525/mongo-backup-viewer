# Contributing

## Running the tests

```bash
npm ci
npm test            # full suite
npx tsc --noEmit    # type check
```

## Fixing a translation

Non-English translations were machine-drafted, and native-speaker fixes are very welcome.

1. Edit `src/i18n/locales/<code>.json`.
2. Run `npx vitest run src/i18n` (checks key parity and plural forms).
3. Open a pull request.

## Adding a language

1. Add `src/i18n/locales/<code>.json` with the same keys as `en.json`.
2. Register it in `LOCALES` and `MESSAGES` in `src/i18n/i18n.ts`.
3. Provide the plural categories the language uses. Print them with:

   ```bash
   node -e "console.log(new Intl.PluralRules('<code>').resolvedOptions().pluralCategories)"
   ```

4. Run `npx vitest run src/i18n`.

## Never commit real backups

Real database backups must never be committed: they may contain private data. `.gitignore` blocks `*.gz` except `public/demo.gz`. Use `npm run demo` to generate synthetic data, and keep real samples outside the repository (for the opt-in smoke test, point `MBV_SAMPLE` at them).
