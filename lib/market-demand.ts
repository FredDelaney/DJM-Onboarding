export type MarketCommercialTerms = {
  currency: string | null;
  maxAge: number | null;
  minAge: number | null;
  registrationNotes: string | null;
  salaryBudget: number | null;
  salaryPeriod: 'week' | 'month' | 'year' | null;
  transferBudget: number | null;
  transferType: 'free' | 'loan' | 'free_or_loan' | 'transfer' | null;
};

const AMOUNT = String.raw`([€£$]?\s*\d+(?:[.,]\d+)*\s*(?:k|m|million|thousand)?)`;

export function extractMarketCommercialTerms(text: string): MarketCommercialTerms {
  const source = text.trim();
  const lower = source.toLowerCase();
  const salaryMatch = firstMatch(source, [
    new RegExp(String.raw`(?:salary|wages?|salary budget|wage budget)[^\d€£$]{0,24}${AMOUNT}`, 'i'),
    new RegExp(String.raw`${AMOUNT}\s*(?:\/|per\s+)(?:week|month|year|annum)`, 'i'),
  ]);
  const transferMatch = firstMatch(source, [
    new RegExp(String.raw`(?:transfer fee|transfer budget|fee budget|budget for (?:the )?(?:fee|transfer))[^\d€£$]{0,24}${AMOUNT}`, 'i'),
    new RegExp(String.raw`${AMOUNT}[^a-z0-9]{0,14}(?:transfer fee|transfer budget|fee budget)`, 'i'),
  ]);
  const ageRange = detectAgeRange(lower);

  return {
    currency: detectCurrency(source),
    maxAge: ageRange?.[1] ?? null,
    minAge: ageRange?.[0] ?? null,
    registrationNotes: extractRegistrationNotes(source),
    salaryBudget: salaryMatch ? parseMarketAmount(salaryMatch[1]) : null,
    salaryPeriod: detectSalaryPeriod(lower),
    transferBudget: transferMatch ? parseMarketAmount(transferMatch[1]) : null,
    transferType: detectTransferType(lower),
  };
}

function detectAgeRange(lower: string): [number, number] | null {
  const match = lower.match(/\b(?:age|aged|ages)\s*(?:between\s*)?([1-3]\d)\s*(?:-|–|—|to|and)\s*([1-3]\d)\b/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return first <= second ? [first, second] : [second, first];
}

function extractRegistrationNotes(source: string) {
  const sentences = source
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const relevant = sentences.filter((sentence) => /\b(passport|registration|registered|homegrown|home-grown|visa|work permit|foreign player|quota|citizenship|nationality)\b/i.test(sentence));
  return relevant.length ? relevant.join(' ') : null;
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function detectCurrency(text: string) {
  const lower = text.toLowerCase();
  if (/€|\beur\b|\beuros?\b/.test(lower)) return 'EUR';
  if (/£|\bgbp\b|\bpounds?\b/.test(lower)) return 'GBP';
  if (/\bnzd\b/.test(lower)) return 'NZD';
  if (/\baud\b/.test(lower)) return 'AUD';
  if (/\busd\b|\bdollars?\b|\$/.test(lower)) return 'USD';
  return null;
}

function detectSalaryPeriod(lower: string): MarketCommercialTerms['salaryPeriod'] {
  if (/(?:\/|per\s+|\b)(?:week|weekly|pw)\b/.test(lower)) return 'week';
  if (/(?:\/|per\s+|\b)(?:month|monthly|pm)\b/.test(lower)) return 'month';
  if (/(?:\/|per\s+|\b)(?:year|yearly|annual|annum|pa)\b/.test(lower)) return 'year';
  return null;
}

function detectTransferType(lower: string): MarketCommercialTerms['transferType'] {
  if (/free[^a-z0-9]+or[^a-z0-9]+(?:free[^a-z0-9]+)?loan|free\s*\/\s*loan/.test(lower)) return 'free_or_loan';
  if (/\bloan\b/.test(lower) && !/\bpermanent\b|\btransfer fee\b|\btransfer budget\b/.test(lower)) return 'loan';
  if (/\bfree agent\b|\bfree transfer\b/.test(lower)) return 'free';
  if (/\bpermanent\b|\btransfer fee\b|\btransfer budget\b|\bcan pay (?:a )?fee\b/.test(lower)) return 'transfer';
  return null;
}

function parseMarketAmount(value: string) {
  const compact = value.toLowerCase().replace(/[€£$\s]/g, '');
  const scale = /m|million/.test(compact) ? 1_000_000 : /k|thousand/.test(compact) ? 1_000 : 1;
  let numeric = compact.replace(/million|thousand|[km]/g, '');

  if (numeric.includes(',') && !numeric.includes('.')) {
    const commaCount = (numeric.match(/,/g) || []).length;
    const decimalPart = numeric.split(',').at(-1) || '';
    numeric = commaCount === 1 && decimalPart.length <= 2 && scale > 1
      ? numeric.replace(',', '.')
      : numeric.replaceAll(',', '');
  } else {
    numeric = numeric.replaceAll(',', '');
  }

  const amount = Number(numeric) * scale;
  return Number.isFinite(amount) ? Math.round(amount) : null;
}
