import i18n from 'i18next';
import Backend from 'i18next-fs-backend';

// Create and configure i18n instance
const i18nInstance = i18n.createInstance();

// Initialize i18n (returns a promise, but we don't await it at module level)
i18nInstance.use(Backend).init({
  fallbackLng: 'en',
  backend: { loadPath: 'locales/{{lng}}/common.json' },
  interpolation: {
    escapeValue: false // React already does escaping
  }
});

// Export the translation function
export const t = i18nInstance.t.bind(i18nInstance);
export default i18nInstance;
