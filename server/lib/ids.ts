import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Random lowercase alphanumeric string. Rejection sampling keeps it unbiased. */
export function randomString(length: number): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 252) out += ALPHABET[byte % 36];
      if (out.length === length) break;
    }
  }
  return out;
}

export type IdPrefix =
  | "usr" | "org" | "inv" | "prj" | "key" | "rep" | "att" | "con" | "dst" | "dlv" | "evt" | "oas" | "eml";

export const newId = (prefix: IdPrefix, length = 14) => `${prefix}_${randomString(length)}`;
