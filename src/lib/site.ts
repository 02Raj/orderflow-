/** Public site identity. Product name: OrderNFlow; domain: ordernflow.com */
export const SITE_DOMAIN = "ordernflow.com";
export const SITE_URL = `https://${SITE_DOMAIN}`;
export const MAIL = {
  hello: `hello@${SITE_DOMAIN}`,
  privacy: `privacy@${SITE_DOMAIN}`,
  security: `security@${SITE_DOMAIN}`,
} as const;
