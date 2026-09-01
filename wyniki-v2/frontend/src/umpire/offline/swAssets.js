const ASSET_ATTR = /(?:src|href)=["'](\/?assets\/[^"']+)["']/g;

export function extractUmpireAssetUrls(html) {
  const urls = [];
  for (const match of String(html || '').matchAll(ASSET_ATTR)) {
    const url = match[1].startsWith('/') ? match[1] : `/${match[1]}`;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}
