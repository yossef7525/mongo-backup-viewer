import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyDocumentLocale, detectLocale, readStoredLocale, storeLocale, translate, type LocaleCode, type MessageKey, type Params } from './i18n';

interface I18nState {
  locale: LocaleCode;
  setLocale(code: LocaleCode): void;
}

const I18nContext = createContext<I18nState>({ locale: 'en', setLocale: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => detectLocale(navigator.languages ?? [navigator.language], new URLSearchParams(location.search).get('lang') ?? readStoredLocale()));
  useEffect(() => applyDocumentLocale(locale), [locale]);
  useEffect(() => {
    document.title = translate(locale, 'app.docTitle');
  }, [locale]);
  const value = useMemo<I18nState>(
    () => ({
      locale,
      setLocale: (code) => {
        storeLocale(code);
        setLocaleState(code);
      },
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useLocale = () => useContext(I18nContext);

export function useT() {
  const { locale } = useLocale();
  return useCallback((key: MessageKey, params?: Params) => translate(locale, key, params), [locale]);
}
