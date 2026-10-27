// ISO 4217 numeric minor units, SIX List One published 2026-09-17.
// Source: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
// SHA-256: 33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff
// Version 1 is frozen: changing existing precision requires a new invoice format version.
// Codes with N.A. minor units (metals/testing/no currency) are not invoice amounts.
const groups: readonly (readonly [number, string])[] = [
  [0, "BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF"],
  [2, "AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CNY COP COU CRC CUP CVE CZK DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GTQ GYD HKD HNL HTG HUF IDR ILS INR IRR JMD KES KGS KHR KPW KYD KZT LAK LBP LKR LRD LSL MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PKR PLN QAR RON RSD RUB SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TOP TRY TTD TWD TZS UAH USD USN UYU UZS VED VES WST XAD XCD XCG YER ZAR ZMW ZWG"],
  [3, "BHD IQD JOD KWD LYD OMR TND"],
  [4, "CLF UYW"],
];
export const INVOICE_CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(groups.flatMap(([digits, codes]) => codes.split(" ").map(code => [code, digits]))),
);
export function invoiceCurrencyMinorUnit(currency: string): number | null {
  return /^[A-Z]{3}$/.test(currency) ? INVOICE_CURRENCY_MINOR_UNITS[currency] ?? null : null;
}
