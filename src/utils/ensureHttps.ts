export const ensureHttps = (url: string) =>
  url.startsWith('http') ? url : `https://${url.replace(/^\/+/, '')}`; 