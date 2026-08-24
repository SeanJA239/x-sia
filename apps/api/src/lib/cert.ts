const SERIAL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const SERIAL_SUFFIX_LENGTH = 5

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SERIAL_SUFFIX_LENGTH))
  return Array.from(bytes, (b) => SERIAL_ALPHABET[b % SERIAL_ALPHABET.length]).join('')
}

/** 格式 XSIA-<term>-<5 位随机大写字母数字>，例如 XSIA-2026-7K2QZ。 */
export function generateCertSerial(term: string): string {
  return `XSIA-${term}-${randomSuffix()}`
}
