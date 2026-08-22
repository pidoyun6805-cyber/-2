// Edge 런타임(middleware)에서도 동작하도록 Web Crypto(SubtleCrypto) 사용
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const AUTH_COOKIE_NAME = "site_auth";

export async function getExpectedAuthValue(): Promise<string> {
  return sha256Hex(process.env.SITE_PASSWORD ?? "");
}
