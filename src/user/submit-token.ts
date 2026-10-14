import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function createSubmitToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashSubmitToken(token) };
}

export function hashSubmitToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifySubmitToken(token: string, expectedHash: string | null): boolean {
  if (!TOKEN_PATTERN.test(token) || !expectedHash || !TOKEN_PATTERN.test(expectedHash)) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(hashSubmitToken(token), 'hex'),
    Buffer.from(expectedHash, 'hex'),
  );
}
