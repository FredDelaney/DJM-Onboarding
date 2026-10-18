import { mixBrandColour, readableBrandInk } from "./tenant-brand-style.ts";

/** One letterhead palette for the browser and both published formats. */
export function documentTheme(brand: { primary: string; accent: string }) {
  const raw = /^#[\da-f]{6}$/i.test(brand.primary) ? brand.primary : "#172A36";
  const surface = mixBrandColour(raw, "#FFFFFF", 0.96);
  return {
    primary: readableBrandInk(raw, surface),
    accent: /^#[\da-f]{6}$/i.test(brand.accent)
      ? brand.accent.toUpperCase()
      : "#AF9367",
    surface,
  };
}

/** Keep short signing blocks intact without preventing long clauses from flowing. */
export function isDocumentSigningBlock(body: string) {
  return body.length < 1500 && /Signature\s*:/i.test(body);
}
