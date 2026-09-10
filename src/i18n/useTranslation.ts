import { useAppStore } from '../store/useAppStore';
import { translations, type TranslationDictionary } from './translations';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from './languages';
import type { LanguageCode, LanguageOption } from '../types';

/**
 * Access a nested string value by dot-separated path (e.g. 'nav.briefing')
 */
function getNestedValue(obj: any, path: string): string | undefined {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * React hook for reactive application localization
 */
export function useTranslation() {
  const language = useAppStore((state) => (state as any).language || DEFAULT_LANGUAGE) as LanguageCode;
  const setLanguage = useAppStore((state) => (state as any).setLanguage) as (lang: LanguageCode) => void;

  const currentDictionary: TranslationDictionary = translations[language] || translations.en;
  const fallbackDictionary: TranslationDictionary = translations.en;

  const t = (path: string, fallback?: string): string => {
    const val = getNestedValue(currentDictionary, path);
    if (val !== undefined) return val;
    const fallbackVal = getNestedValue(fallbackDictionary, path);
    if (fallbackVal !== undefined) return fallbackVal;
    return fallback || path;
  };

  const currentLanguageOption: LanguageOption =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  return {
    t,
    language,
    setLanguage,
    currentLanguageOption,
    supportedLanguages: SUPPORTED_LANGUAGES,
    dict: currentDictionary,
  };
}

/**
 * Non-React helper for standalone utility functions
 */
export function getTranslation(language: LanguageCode = 'en', path: string, fallback?: string): string {
  const currentDict = translations[language] || translations.en;
  const val = getNestedValue(currentDict, path);
  if (val !== undefined) return val;
  const fallbackVal = getNestedValue(translations.en, path);
  if (fallbackVal !== undefined) return fallbackVal;
  return fallback || path;
}
