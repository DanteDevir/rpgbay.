import {
  S3Client,
  HeadBucketCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";
const classes = ["PUBLIC", "LIBRARY", "USER", "PUBLISHING", "BACKUPS"];
const allowed = (process.env.R2_CORS_ORIGINS || process.env.WEB_ORIGIN || "")
  .split(",")
  .filter(Boolean);
const cors = {
  CORSRules: [
    {
      AllowedOrigins: allowed,
      AllowedMethods: ["GET", "HEAD", "PUT"],
      AllowedHeaders: ["Content-Type", "Content-Length", "Range"],
      ExposeHeaders: [
        "ETag",
        "Content-Range",
        "Accept-Ranges",
        "X-Content-SHA256",
      ],
      MaxAgeSeconds: 300,
    },
  ],
};
const mode = process.argv[2] || "plan";
if (mode === "plan") {
  console.log(
    JSON.stringify(
      {
        action: "REVIEW_ONLY_NO_REMOTE_WRITES",
        classes,
        proposedCors: cors,
        notes: [
          "Create separate private buckets per environment through approved Cloudflare process.",
          "Never enable public access for LIBRARY, USER, PUBLISHING, BACKUPS.",
          "Review lifecycle quarantine expiration and references before applying.",
          "No provisioning or cost activation occurs from this script.",
        ],
      },
      null,
      2,
    ),
  );
} else if (mode === "verify") {
  for (const name of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    ...classes.map((c) => `R2_BUCKET_${c}`),
  ])
    if (!process.env[name]) throw new Error(`Missing ${name}`);
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  for (const name of classes) {
    const Bucket = process.env[`R2_BUCKET_${name}`];
    await client.send(new HeadBucketCommand({ Bucket }));
    const configured = await client.send(new GetBucketCorsCommand({ Bucket }));
    console.log(
      JSON.stringify({
        class: name,
        reachable: true,
        corsRules: configured.CORSRules?.length || 0,
      }),
    );
  }
  console.log(
    "Bucket reachability/CORS query completed. This does not certify public-access or lifecycle policies.",
  );
} else throw new Error("Usage: node scripts/r2-config.mjs plan|verify");
