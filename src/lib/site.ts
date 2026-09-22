/** Public site identity. Product name stays OrderFlow; this is the web address. */
export const SITE_DOMAIN = "helloorderflow.com";
export const SITE_URL = `https://${SITE_DOMAIN}`;
export const MAIL = {
  hello: `hello@${SITE_DOMAIN}`,
  privacy: `privacy@${SITE_DOMAIN}`,
  security: `security@${SITE_DOMAIN}`,
} as const;
