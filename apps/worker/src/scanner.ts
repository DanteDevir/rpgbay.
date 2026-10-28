/** Linux isolated scanner. Requires current ClamAV definitions, qpdf, ImageMagick, prlimit. */
import { createServer } from "node:http";
import { mkdtemp, rm, stat, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
const LIMIT = 512 * 1024 * 1024;
function run(
  command: string,
  args: string[],
  maximumOutput = 8 * 1024 * 1024,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "prlimit",
      [
        command === "clamscan" ? "--as=2147483648" : "--as=805306368",
        "--cpu=25",
        "--fsize=671088640",
        "--",
        command,
        ...args,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH,
          HOME: tmpdir(),
          MAGICK_MEMORY_LIMIT: "128MiB",
          MAGICK_MAP_LIMIT: "128MiB",
          MAGICK_DISK_LIMIT: "0",
          MAGICK_THREAD_LIMIT: "1",
        },
      },
    );
    let output = "",
      errorOutput = "",
      done = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 30000);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (Buffer.byteLength(output) > maximumOutput) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (errorOutput.length < 2000) errorOutput += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!done) {
        done = true;
        reject(error);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!done) {
        done = true;
        if (code === 0) resolve(output);
        else reject(new Error(`Scanner tool failed: ${command} (${code})`));
      }
    });
  });
}
export async function scanFile(path: string, mime: string) {
  await run(
    "clamscan",
    [
      "--no-summary",
      "--max-filesize=512M",
      "--max-scansize=640M",
      "--alert-exceeds-max=yes",
      "--alert-encrypted=yes",
      path,
    ],
    1024 * 1024,
  );
  if (mime === "application/pdf") {
    await run("qpdf", ["--check", path]);
    const json = await run("qpdf", ["--json", "--json-stream-data=none", path]);
    // Fail closed on active content, external actions, embedded payloads or encrypted documents.
    const parsed = JSON.parse(json);
    const serialized = JSON.stringify(parsed);
    if (
      /\/(JavaScript|JS|OpenAction|AA|EmbeddedFiles|EmbeddedFile|Launch|RichMedia|XFA|SubmitForm|ImportData|GoToR|Encrypt)\b/.test(
        serialized,
      )
    )
      throw new Error("PDF active or embedded content rejected");
    const expanded = `${path}.expanded`;
    await run("qpdf", [
      "--object-streams=disable",
      "--stream-data=uncompress",
      path,
      expanded,
    ]);
    if ((await stat(expanded)).size > 640 * 1024 * 1024)
      throw new Error("Expanded PDF exceeds limits");
    return { clean: true, mime };
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
    throw new Error("Unsupported MIME");
  const info = (
    await run(
      "identify",
      ["-regard-warnings", "-format", "%m %w %h %n", path],
      1000,
    )
  )
    .trim()
    .split(" ");
  const expected: Record<string, string[]> = {
    "image/png": ["PNG"],
    "image/jpeg": ["JPEG", "JPG"],
    "image/webp": ["WEBP"],
  };
  const width = Number(info[1]),
    height = Number(info[2]);
  if (
    !expected[mime]?.includes(info[0] ?? "") ||
    Number(info[3]) !== 1 ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 40000000
  )
    throw new Error("Raster dimensions/frames invalid");
  await run("convert", [
    "-limit",
    "memory",
    "128MiB",
    "-limit",
    "map",
    "128MiB",
    "-limit",
    "disk",
    "0",
    path,
    "null:",
  ]);
  return { clean: true, mime, width, height };
}
export function startScanner(port = Number(process.env.SCANNER_PORT ?? 3002)) {
  const token = process.env.SCANNER_TOKEN;
  if (!token || token.length < 32)
    throw new Error("SCANNER_TOKEN must contain at least 32 characters");
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url === "/health") {
      let probeDirectory: string | undefined;
      try {
        probeDirectory = await mkdtemp(join(tmpdir(), "rpgbay-scan-health-"));
        const probe = join(probeDirectory, "probe.txt");
        const file = await open(probe, "wx", 0o600);
        try {
          await file.writeFile("RPG BAY scanner readiness probe\n");
        } finally {
          await file.close();
        }
        await run("clamscan", ["--no-summary", probe], 1000);
        await run("qpdf", ["--version"], 1000);
        await run("identify", ["-version"], 1000);
        res.end(JSON.stringify({ status: "ready" }));
      } catch {
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            status: "blocked",
            reason: "Scanner binaries/definitions unavailable",
          }),
        );
      } finally {
        if (probeDirectory)
          await rm(probeDirectory, { recursive: true, force: true });
      }
      return;
    }
    const supplied = Buffer.from(String(req.headers.authorization ?? "")),
      expected = Buffer.from(`Bearer ${token}`);
    if (
      req.method !== "POST" ||
      req.url !== "/scan" ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.statusCode = 403;
      res.end(JSON.stringify({ clean: false }));
      return;
    }
    const mime = String(req.headers["content-type"] ?? "");
    let directory: string | undefined;
    try {
      if (
        !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
          mime,
        )
      )
        throw new Error("Unsupported MIME");
      directory = await mkdtemp(join(tmpdir(), "rpgbay-scan-"));
      const path = join(directory, "upload");
      let size = 0;
      const file = await open(path, "wx", 0o600);
      // Overall input bounded; scanner process itself receives CPU/address-space/file limits.
      try {
        for await (const chunk of req) {
          size += (chunk as Buffer).length;
          if (size > LIMIT) throw new Error("Scanner size limit");
          await file.writeFile(chunk as Buffer);
        }
      } finally {
        await file.close();
      }
      const result = await scanFile(path, mime);
      res.end(JSON.stringify(result));
    } catch {
      res.statusCode = 422;
      res.end(
        JSON.stringify({
          clean: false,
          reason: "Content rejected or scanner unavailable",
        }),
      );
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 10000;
  server.maxConnections = 2;
  return server.listen(port, process.env.SCANNER_HOST ?? "127.0.0.1");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  startScanner();
