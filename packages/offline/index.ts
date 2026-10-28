import {
  createDecipheriv,
  createHash,
  verify,
  type KeyLike,
} from "node:crypto";
import { open, rename, stat, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface OfflineFile {
  id: string;
  bytes: number;
  sha256: string;
  nonce: string;
  tag: string;
}
export interface OfflineLicense {
  version: 1;
  licenseId: string;
  accountId: string;
  deviceId: string;
  bookId: string;
  source: "purchase" | "family";
  issuedAt: number;
  expiresAt: number;
  files: OfflineFile[];
}
export interface SignedManifest {
  payload: string;
  signature: string;
}
const MAX_FILE = 4 * 1024 * 1024 * 1024;
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v);

/** Verify the original bytes, never a reserialized JSON object. Trust roots come from deployment configuration. */
export function verifyManifest(
  envelope: SignedManifest,
  publicKey: KeyLike,
  accountId: string,
  deviceId: string,
  now = Date.now(),
): OfflineLicense {
  if (
    typeof envelope.payload !== "string" ||
    envelope.payload.length > 1_000_000 ||
    typeof envelope.signature !== "string"
  )
    throw new Error("Invalid manifest envelope");
  const bytes = Buffer.from(envelope.payload, "base64url");
  if (
    !verify(
      null,
      bytes,
      publicKey,
      Buffer.from(envelope.signature, "base64url"),
    )
  )
    throw new Error("Invalid manifest signature");
  const m = JSON.parse(bytes.toString("utf8")) as OfflineLicense;
  if (
    m.version !== 1 ||
    !id(m.licenseId) ||
    !id(m.bookId) ||
    m.accountId !== accountId ||
    m.deviceId !== deviceId ||
    !["purchase", "family"].includes(m.source)
  )
    throw new Error("License identity mismatch");
  if (
    !Number.isSafeInteger(m.issuedAt) ||
    !Number.isSafeInteger(m.expiresAt) ||
    m.issuedAt > now + 60_000 ||
    m.expiresAt <= now ||
    m.expiresAt <= m.issuedAt
  )
    throw new Error("License expired or invalid");
  if (!Array.isArray(m.files) || !m.files.length || m.files.length > 1000)
    throw new Error("Invalid manifest files");
  const ids = new Set<string>();
  for (const f of m.files) {
    if (
      !id(f.id) ||
      ids.has(f.id) ||
      !Number.isSafeInteger(f.bytes) ||
      f.bytes <= 0 ||
      f.bytes > MAX_FILE ||
      !/^[a-f0-9]{64}$/.test(f.sha256) ||
      !/^[a-f0-9]{24}$/.test(f.nonce) ||
      !/^[a-f0-9]{32}$/.test(f.tag)
    )
      throw new Error("Invalid file descriptor");
    ids.add(f.id);
  }
  return m;
}

/** Ciphertext is hashed before decrypting. AAD binds ciphertext to this license, device and component. */
export function decryptComponent(
  ciphertext: Uint8Array,
  key: Uint8Array,
  license: OfflineLicense,
  file: OfflineFile,
): Buffer {
  if (
    !license.files.some((f) => f.id === file.id && f.sha256 === file.sha256) ||
    ciphertext.length !== file.bytes ||
    createHash("sha256").update(ciphertext).digest("hex") !== file.sha256
  )
    throw new Error("Package integrity failed");
  if (key.length !== 32) throw new Error("AES-256 key required");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(file.nonce, "hex"),
  );
  decipher.setAuthTag(Buffer.from(file.tag, "hex"));
  decipher.setAAD(
    Buffer.from(
      JSON.stringify([
        license.licenseId,
        license.accountId,
        license.deviceId,
        file.id,
      ]),
    ),
  );
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Refresh signed URLs at the caller. Never log URLs or persist bearer query parameters. */
export async function downloadComponent(
  url: string,
  destination: string,
  file: OfflineFile,
  options: { signal?: AbortSignal; allowLocalTest?: boolean } = {},
): Promise<void> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !(
      options.allowLocalTest &&
      parsed.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(parsed.hostname)
    )
  )
    throw new Error("HTTPS required");
  if (parsed.username || parsed.password)
    throw new Error("URL credentials forbidden");
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const partial = `${destination}.part`;
  let offset = 0;
  try {
    offset = (await stat(partial)).size;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (offset > file.bytes) {
    await unlink(partial);
    offset = 0;
  }
  if (offset < file.bytes) {
    const response = await fetch(url, {
      headers: offset ? { Range: `bytes=${offset}-` } : {},
      signal: options.signal ?? AbortSignal.timeout(60_000),
      redirect: "error",
    });
    if (response.status === 200 && offset) offset = 0; // Server ignored Range: restart safely.
    if (![200, 206].includes(response.status) || !response.body)
      throw new Error(`Download HTTP ${response.status}`);
    if (
      response.status === 206 &&
      response.headers.get("content-range") !==
        `bytes ${offset}-${file.bytes - 1}/${file.bytes}`
    )
      throw new Error("Invalid Content-Range");
    const declared = response.headers.get("content-length");
    if (declared && Number(declared) !== file.bytes - offset)
      throw new Error("Invalid download size");
    const handle = await open(partial, offset ? "r+" : "w", 0o600);
    let position = offset;
    try {
      for await (const chunk of response.body) {
        if (position + chunk.length > file.bytes) {
          await response.body.cancel().catch(() => {});
          throw new Error("Download exceeds manifest size");
        }
        let written = 0;
        while (written < chunk.length)
          written += (
            await handle.write(
              chunk,
              written,
              chunk.length - written,
              position + written,
            )
          ).bytesWritten;
        position += chunk.length;
      }
      if (position !== file.bytes) throw new Error("Download interrupted");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  const handle = await open(partial, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close();
  }
  if (hash.digest("hex") !== file.sha256) {
    await unlink(partial);
    throw new Error("Download checksum mismatch");
  }
  await rename(partial, destination);
}
