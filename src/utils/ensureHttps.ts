export const ensureHttps = (url: string) => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Use plain HTTP for localhost to avoid certificate issues in development
  if (url.startsWith('localhost') || url.startsWith('127.0.0.1')) {
    return `http://${url.replace(/^\/+/, '')}`;
  }

  return `https://${url.replace(/^\/+/, '')}`;
};
