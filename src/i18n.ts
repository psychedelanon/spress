import i18n from 'i18next';
import Backend from 'i18next-fs-backend';

export const t = i18n.createInstance();
await t.use(Backend).init({
  fallbackLng: 'en',
  backend: { loadPath: 'locales/{{lng}}/common.json' }
});
