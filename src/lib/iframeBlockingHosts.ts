/** Hosts that block embedding in iframes (X-Frame-Options / CSP). Open in new tab instead. */
const IFRAME_BLOCKING_HOSTS = [
  "yahoo.com",
  "cnbc.com",
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "economist.com",
  "bbc.com",
  "bbc.co.uk",
  "theguardian.com",
  "nytimes.com",
  "washingtonpost.com",
  "cnn.com",
  "npr.org",
  "axios.com",
  "politico.com",
  "marketwatch.com",
  "barrons.com",
  "seekingalpha.com",
  "investing.com",
  "businessinsider.com",
];

export function isHostBlockingIframe(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return IFRAME_BLOCKING_HOSTS.some((blocked) => host === blocked || host.endsWith("." + blocked));
  } catch {
    return false;
  }
}
