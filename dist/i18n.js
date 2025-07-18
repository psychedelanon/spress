"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.t = void 0;
const i18next_1 = __importDefault(require("i18next"));
const i18next_fs_backend_1 = __importDefault(require("i18next-fs-backend"));
// Create and configure i18n instance
const i18nInstance = i18next_1.default.createInstance();
// Initialize i18n (returns a promise, but we don't await it at module level)
i18nInstance.use(i18next_fs_backend_1.default).init({
    fallbackLng: 'en',
    backend: { loadPath: 'locales/{{lng}}/common.json' },
    interpolation: {
        escapeValue: false // React already does escaping
    }
});
// Export the translation function
exports.t = i18nInstance.t.bind(i18nInstance);
exports.default = i18nInstance;
