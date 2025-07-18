"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureHttps = void 0;
const ensureHttps = (url) => url.startsWith('http') ? url : `https://${url.replace(/^\/+/, '')}`;
exports.ensureHttps = ensureHttps;
