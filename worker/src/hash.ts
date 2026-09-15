/** sha256(input || salt) as lowercase hex. Used for install ids and client IPs. */
export async function saltedHash(input: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${input}|${salt}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
