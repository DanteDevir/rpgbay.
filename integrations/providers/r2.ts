import type { Readable } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export type StorageClass =
  "public" | "library" | "user" | "publishing" | "backups";
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  buckets: Record<StorageClass, string>;
  localEndpoint?: string;
}
export interface UploadIntent {
  id: string;
  tenantId: string;
  key: string;
  storageClass: StorageClass;
  maxBytes: number;
  declaredBytes: number;
  expectedSha256: string;
  mime: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  expiresAt: number;
}
export interface ScanVerdict {
  clean: boolean;
  reason?: string;
}
export interface ContentScanner {
  /** Must inspect full content in isolation, including PDF active content/decompression limits. */ scan(input: {
    stream: AsyncIterable<Uint8Array>;
    mime: string;
    size: number;
    key: string;
  }): Promise<ScanVerdict>;
}
export function uploadIntent(
  input: Omit<UploadIntent, "id" | "key" | "expiresAt">,
): UploadIntent {
  if (
    !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
      input.mime,
    ) ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(input.tenantId) ||
    !Number.isSafeInteger(input.maxBytes) ||
    input.maxBytes < 1 ||
    !Number.isSafeInteger(input.declaredBytes) ||
    input.declaredBytes < 1 ||
    input.declaredBytes > input.maxBytes ||
    !/^[a-f0-9]{64}$/.test(input.expectedSha256)
  )
    throw new Error("Invalid upload intent");
  const id = randomUUID();
  return Object.freeze({
    ...input,
    id,
    key: `quarantine/${input.tenantId}/${id}`,
    expiresAt: Date.now() + 600000,
  });
}
export function inspectMagic(
  head: Uint8Array,
  mime: string,
): { width?: number; height?: number } {
  const b = Buffer.from(head);
  if (mime === "application/pdf" && b.subarray(0, 5).toString() === "%PDF-")
    return {};
  if (
    mime === "image/png" &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    b.length >= 24 &&
    b.toString("ascii", 12, 16) === "IHDR"
  )
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (mime === "image/jpeg" && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return {};
  if (
    mime === "image/webp" &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return {};
  throw new Error("Content MIME mismatch or unsupported type");
}
export async function validateBytes(
  stream: AsyncIterable<Uint8Array>,
  intent: UploadIntent,
) {
  let size = 0;
  let head = Buffer.alloc(0);
  const hash = createHash("sha256");
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > intent.maxBytes || size > intent.declaredBytes)
      throw new Error("Upload size limit exceeded");
    hash.update(chunk);
    if (head.length < 65536)
      head = Buffer.concat([
        head,
        Buffer.from(chunk).subarray(0, 65536 - head.length),
      ]);
  }
  if (size !== intent.declaredBytes) throw new Error("Upload length mismatch");
  const sha256 = hash.digest("hex");
  if (sha256 !== intent.expectedSha256)
    throw new Error("Upload checksum mismatch");
  const dimensions = inspectMagic(head, intent.mime);
  if (
    dimensions.width !== undefined &&
    (!dimensions.width ||
      !dimensions.height ||
      dimensions.width > 16384 ||
      dimensions.height > 16384 ||
      dimensions.width * dimensions.height > 40000000)
  )
    throw new Error("Image dimensions exceed policy");
  return { size, sha256, ...dimensions };
}
export class R2Provider {
  readonly client: S3Client;
  constructor(private config: R2Config) {
    if (
      !/^[a-f0-9]{32}$/.test(config.accountId) ||
      !config.accessKeyId ||
      !config.secretAccessKey ||
      (["public", "library", "user", "publishing", "backups"] as const).some(
        (k) => !config.buckets[k],
      )
    )
      throw new Error("R2 configuration missing or invalid");
    if (
      (["library", "user", "publishing", "backups"] as const).some(
        (k) => config.buckets[k] === config.buckets.public,
      )
    )
      throw new Error("Private storage classes must not use the public bucket");
    if (config.localEndpoint) {
      const url = new URL(config.localEndpoint);
      if (
        !["development", "test"].includes(process.env.NODE_ENV ?? "") ||
        url.protocol !== "http:" ||
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error(
          "Local S3 emulator endpoint is allowed only in isolated development/test",
        );
    }
    this.client = new S3Client({
      region: "auto",
      endpoint:
        config.localEndpoint ??
        `https://${config.accountId}.r2.cloudflarestorage.com`,
      ...(config.localEndpoint ? { forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      maxAttempts: 3,
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }
  private bucket(intent: UploadIntent) {
    const bucket = this.config.buckets[intent.storageClass];
    if (!bucket) throw new Error("Unknown storage class");
    return bucket;
  }
  async putQuarantine(intent: UploadIntent, body: Readable) {
    if (intent.expiresAt <= Date.now())
      throw new Error("Expired upload intent");
    return this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket(intent),
        Key: intent.key,
        Body: body,
        ContentLength: intent.declaredBytes,
        ContentType: intent.mime,
      }),
    );
  }
  async presignUpload(intent: UploadIntent) {
    if (intent.expiresAt <= Date.now())
      throw new Error("Expired upload intent");
    // Header length is signed, but gateway and post-upload validation remain mandatory.
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket(intent),
        Key: intent.key,
        ContentType: intent.mime,
        ContentLength: intent.declaredBytes,
      }),
      {
        expiresIn: Math.min(
          600,
          Math.max(1, Math.floor((intent.expiresAt - Date.now()) / 1000)),
        ),
      },
    );
  }
  async download(storageClass: StorageClass, key: string, range?: string) {
    if (!/^(objects|quarantine)\/[a-zA-Z0-9_/-]+$/.test(key))
      throw new Error("Invalid object key");
    if (range && !/^bytes=\d+-\d*$/.test(range))
      throw new Error("Invalid range");
    return this.client.send(
      new GetObjectCommand({
        Bucket: this.config.buckets[storageClass],
        Key: key,
        ...(range ? { Range: range } : {}),
      }),
    );
  }
  async presignDownload(storageClass: StorageClass, key: string) {
    if (!/^objects\/[a-zA-Z0-9_/-]+$/.test(key))
      throw new Error("Invalid object key");
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.buckets[storageClass],
        Key: key,
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: 120 },
    );
  }
  async validateAndPublish(intent: UploadIntent, scanner: ContentScanner) {
    const Bucket = this.bucket(intent);
    let publishedKey: string | undefined;
    try {
      // Signed upload URLs remain reusable: pin the exact object version with ETag conditions.
      const object = await this.client.send(
        new GetObjectCommand({ Bucket, Key: intent.key }),
      );
      if (!object.Body || !object.ETag)
        throw new Error("Missing object body or version marker");
      const validation = await validateBytes(
        object.Body as AsyncIterable<Uint8Array>,
        intent,
      );
      const second = await this.client.send(
        new GetObjectCommand({ Bucket, Key: intent.key, IfMatch: object.ETag }),
      );
      if (!second.Body) throw new Error("Missing scan body");
      const verdict = await scanner.scan({
        stream: second.Body as AsyncIterable<Uint8Array>,
        mime: intent.mime,
        size: validation.size,
        key: intent.key,
      });
      if (!verdict.clean)
        throw new Error("Upload rejected by isolated scanner");
      publishedKey = `objects/${intent.tenantId}/${intent.id}/${validation.sha256}`;
      await this.client.send(
        new CopyObjectCommand({
          Bucket,
          Key: publishedKey,
          CopySource: `${Bucket}/${intent.key}`,
          CopySourceIfMatch: object.ETag,
          MetadataDirective: "REPLACE",
          ContentType: intent.mime,
          CacheControl:
            intent.storageClass === "public"
              ? "public, max-age=31536000, immutable"
              : "private, no-store",
          Metadata: { sha256: validation.sha256 },
        }),
      );
      await this.client.send(
        new DeleteObjectCommand({ Bucket, Key: intent.key }),
      );
      return { key: publishedKey, ...validation };
    } catch (error) {
      await this.client.send(
        new DeleteObjectCommand({ Bucket, Key: intent.key }),
      );
      if (publishedKey)
        await this.client.send(
          new DeleteObjectCommand({ Bucket, Key: publishedKey }),
        );
      throw error;
    }
  }
  async beginMultipart(intent: UploadIntent) {
    return this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket(intent),
        Key: intent.key,
        ContentType: intent.mime,
      }),
    );
  }
  async presignPart(
    intent: UploadIntent,
    uploadId: string,
    partNumber: number,
  ) {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000)
      throw new Error("Invalid multipart part");
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.bucket(intent),
        Key: intent.key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 600 },
    );
  }
  async completeMultipart(
    intent: UploadIntent,
    uploadId: string,
    parts: readonly { ETag: string; PartNumber: number }[],
  ) {
    if (
      !parts.length ||
      parts.length > 10000 ||
      parts.some((p, i) => p.PartNumber !== i + 1 || !p.ETag)
    )
      throw new Error("Invalid multipart manifest");
    return this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket(intent),
        Key: intent.key,
        UploadId: uploadId,
        MultipartUpload: { Parts: [...parts] },
      }),
    );
  }
  abortMultipart(intent: UploadIntent, uploadId: string) {
    return this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket(intent),
        Key: intent.key,
        UploadId: uploadId,
      }),
    );
  }
  health(storageClass: StorageClass, key: string) {
    return this.client.send(
      new HeadObjectCommand({
        Bucket: this.config.buckets[storageClass],
        Key: key,
      }),
    );
  }
}
