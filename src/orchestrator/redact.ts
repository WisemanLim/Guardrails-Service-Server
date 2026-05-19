import { DetectionMatch } from '../clients/detection.client';

const PLACEHOLDER: Record<string, string> = {
  national_id_kr: '******-*******',
  ssn_us: '***-**-****',
  mynumber_jp: '****-****-****',
  passport: '[PASSPORT]',
  card_number: '[CARD]',
  iban: '[IBAN]',
  email: '[EMAIL]',
  phone_kr: '[PHONE]',
  phone_us: '[PHONE]',
  business_reg_kr: '[BRN]',
  driver_license_kr: '[DL]',
  ip_address: '[IP]',
  api_key: '[SECRET]',
};

/**
 * Replace each match with its category-aware placeholder. Walk right-to-left
 * so we don't have to fix up offsets after each replacement.
 */
export function redact(text: string, matches: DetectionMatch[]): string {
  if (!matches.length) return text;
  const sorted = [...matches].sort((a, b) => b.start - a.start);
  let out = text;
  for (const m of sorted) {
    const ph = PLACEHOLDER[m.sub_category] ?? '[REDACTED]';
    out = out.slice(0, m.start) + ph + out.slice(m.end);
  }
  return out;
}
