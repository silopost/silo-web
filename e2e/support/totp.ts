import { createHmac } from "node:crypto";

/** RFC 4648 base32 (no padding) as in otpauth:// secrets. */
function base32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of secret.replace(/[\s=]/g, "").toUpperCase()) {
    const i = alphabet.indexOf(ch);
    if (i < 0) throw new Error(`totp: not base32: ${ch}`);
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 code (SHA1, 30 s, 6 digits) of a time step. */
export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export const currentStep = () => Math.floor(Date.now() / 30_000);

/**
 * A code of a time step after `usedStep` (the server refuses a step used before), waiting for
 * the next step when needed; returns the code and its step.
 */
export async function freshTotp(
  secret: string,
  usedStep = -1,
): Promise<{ code: string; step: number }> {
  while (currentStep() <= usedStep) await new Promise((r) => setTimeout(r, 500));
  const step = currentStep();
  return { code: totpAt(secret, step), step };
}
