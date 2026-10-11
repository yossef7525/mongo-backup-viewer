import { LOCALES, type LocaleCode } from '../i18n/i18n';
import { useLocale, useT } from '../i18n/react';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <select className="lang" value={locale} aria-label={t('lang.label')} onChange={(e) => setLocale(e.target.value as LocaleCode)}>
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code} lang={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
