export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function rolloutBucket(
  userId: string,
  flagKey: string,
): Promise<number> {
  const hash = await sha256Hex(`${userId}:${flagKey}`);
  const value = BigInt('0x' + hash);
  return Number(value % 100n);
}
