import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign,
  randomBytes,
  createCipheriv,
  createHash,
} from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import {
  verifyManifest,
  decryptComponent,
  downloadComponent,
  type OfflineLicense,
} from "../packages/offline/index.ts";

function fixture(accountId = "account1", deviceId = "device1") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = randomBytes(32),
    nonce = randomBytes(12),
    plain = Buffer.from("Livro autorizado: página 1.");
  const license: OfflineLicense = {
    version: 1,
    licenseId: "license1",
    accountId,
    deviceId,
    bookId: "book1",
    source: "family",
    issuedAt: Date.now() - 1000,
    expiresAt: Date.now() + 3600000,
    files: [],
  };
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(
    Buffer.from(
      JSON.stringify([
        license.licenseId,
        license.accountId,
        license.deviceId,
        "part1",
      ]),
    ),
  );
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const file = {
    id: "part1",
    bytes: encrypted.length,
    sha256: createHash("sha256").update(encrypted).digest("hex"),
    nonce: nonce.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
  license.files.push(file);
  const payload = Buffer.from(JSON.stringify(license));
  const envelope = {
    payload: payload.toString("base64url"),
    signature: sign(null, payload, privateKey).toString("base64url"),
  };
  return { key, plain, encrypted, file, license, envelope, publicKey };
}
test("signed offline license rejects tampering, wrong account/device and expired leases", () => {
  const f = fixture();
  assert.equal(
    verifyManifest(f.envelope, f.publicKey, "account1", "device1").bookId,
    "book1",
  );
  assert.throws(
    () =>
      verifyManifest(
        { ...f.envelope, payload: Buffer.from("{}").toString("base64url") },
        f.publicKey,
        "account1",
        "device1",
      ),
    /signature/,
  );
  assert.throws(
    () => verifyManifest(f.envelope, f.publicKey, "account2", "device1"),
    /identity/,
  );
  assert.throws(
    () => verifyManifest(f.envelope, f.publicKey, "account1", "device2"),
    /identity/,
  );
  assert.throws(
    () =>
      verifyManifest(
        f.envelope,
        f.publicKey,
        "account1",
        "device1",
        f.license.expiresAt,
      ),
    /expired/,
  );
});
test("AES-GCM component rejects corruption, another key and identity/AAD swapping", () => {
  const f = fixture();
  assert.deepEqual(
    decryptComponent(f.encrypted, f.key, f.license, f.file),
    f.plain,
  );
  assert.throws(
    () => decryptComponent(Buffer.from("corrupt"), f.key, f.license, f.file),
    /integrity/,
  );
  assert.throws(() =>
    decryptComponent(f.encrypted, randomBytes(32), f.license, f.file),
  );
  assert.throws(() =>
    decryptComponent(
      f.encrypted,
      f.key,
      { ...f.license, deviceId: "device2" },
      f.file,
    ),
  );
  const opaque = fixture("account:segment", "device");
  assert.throws(() =>
    decryptComponent(
      opaque.encrypted,
      opaque.key,
      { ...opaque.license, accountId: "account", deviceId: "segment:device" },
      opaque.file,
    ),
  );
});
test("resumes encrypted component, restarts on ignored Range, rejects bad ranges and checksum", async () => {
  const f = fixture(),
    dir = await mkdtemp(join(tmpdir(), "rpgbay-offline-"));
  let mode = "range",
    range: string | undefined;
  const server = createServer((req, res) => {
    range = req.headers.range;
    const offset = Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1] ?? 0);
    if (mode === "range" || mode === "bad-range") {
      res.statusCode = 206;
      res.setHeader(
        "Content-Range",
        `bytes ${mode === "bad-range" ? 0 : offset}-${f.file.bytes - 1}/${f.file.bytes}`,
      );
      res.end(f.encrypted.subarray(offset));
    } else if (mode === "corrupt") res.end(Buffer.alloc(f.file.bytes));
    else res.end(f.encrypted);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No local address");
  const url = `http://127.0.0.1:${address.port}/cipher`,
    destination = join(dir, "part1");
  try {
    await writeFile(`${destination}.part`, f.encrypted.subarray(0, 5));
    await downloadComponent(url, destination, f.file, { allowLocalTest: true });
    assert.equal(range, "bytes=5-");
    assert.deepEqual(await readFile(destination), f.encrypted);
    mode = "ignored";
    await writeFile(`${destination}.part`, f.encrypted.subarray(0, 3));
    await downloadComponent(url, destination, f.file, { allowLocalTest: true });
    assert.deepEqual(await readFile(destination), f.encrypted);
    mode = "bad-range";
    await writeFile(`${destination}.part`, f.encrypted.subarray(0, 3));
    await assert.rejects(
      downloadComponent(url, destination, f.file, { allowLocalTest: true }),
      /Content-Range/,
    );
    mode = "corrupt";
    await rm(`${destination}.part`);
    await assert.rejects(
      downloadComponent(url, destination, f.file, { allowLocalTest: true }),
      /checksum/,
    );
    await assert.rejects(downloadComponent(url, destination, f.file), /HTTPS/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
