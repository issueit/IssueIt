import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords, RFC 6238, written out rather than taken as
 * a dependency: it is HMAC-SHA1 over a counter and a modulo, and an
 * authenticator app is not a thing to hand someone else's code.
 *
 * Six digits, thirty-second steps, and one step either side accepted, which
 * is what every app and every clock expects.
 */

const DIGITS = 6;
const STEP = 30;
/** One step either side, so a phone a few seconds out still works. */
const WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("That isn't a valid key.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A fresh 160-bit secret, in the base32 every authenticator app reads. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

function codeAt(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const mac = createHmac("sha1", secret).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The code for right now, for tests and for showing a setup worked. */
export const totpNow = (secret: string, at = Date.now()) => codeAt(base32Decode(secret), Math.floor(at / 1000 / STEP));

export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== DIGITS) return false;
  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    return false;
  }
  const counter = Math.floor(at / 1000 / STEP);
  let ok = false;
  // Every candidate is compared, and compared in constant time, so neither
  // the clock offset nor the digits leak through how long this took.
  for (let drift = -WINDOW; drift <= WINDOW; drift += 1) {
    const expected = Buffer.from(codeAt(key, counter + drift));
    if (timingSafeEqual(Buffer.from(digits), expected)) ok = true;
  }
  return ok;
}

/** The URL an authenticator app reads from a QR code. */
export function otpauthUrl(secret: string, account: string, issuer = "Issueit"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Codes for when the phone is lost: ten of them, grouped for reading aloud.
 * Stored hashed, like passwords are, and each usable once.
 */
export function newRecoveryCodes(count = 10): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const codes: string[] = [];
  while (codes.length < count) {
    let code = "";
    for (const byte of randomBytes(10)) {
      if (byte < 248) code += alphabet[byte % alphabet.length];
      if (code.length === 10) break;
    }
    if (code.length === 10) codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

export const normaliseRecoveryCode = (code: string) => code.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
