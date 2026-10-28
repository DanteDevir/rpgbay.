import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createApp } from "../apps/api/src/server.js";
const database = process.env.TEST_DATABASE_URL;
if (
  database &&
  !/^[a-zA-Z0-9_-]+_test$/.test(new URL(database).pathname.slice(1))
)
  throw new Error(
    "TEST_DATABASE_URL deve apontar a um banco dedicado com sufixo _test.",
  );
test(
  "API PostgreSQL authorization, concurrency and recoverable conflicts",
  { skip: !database },
  async (t) => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_ENABLED = "true";
    const pool = new pg.Pool({ connectionString: database, max: 15 });
    const app = await createApp({ pool, logger: false });
    await app.ready();
    t.after(async () => {
      await app.close();
      await pool.end();
    });
    const prefix = `test_${randomUUID().replaceAll("-", "")}`,
      owner = `${prefix}_owner`,
      other = `${prefix}_other`;
    async function call(
      user: string,
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url: string,
      body?: unknown,
    ) {
      const response = await app.inject({
        method,
        url,
        headers: { "x-dev-user": user },
        ...(body ? { payload: body } : {}),
      });
      return { status: response.statusCode, data: response.json() };
    }
    await t.test(
      "protected routes reject missing identity and ignore spoofed privilege",
      async () => {
        assert.equal((await app.inject({ url: "/api/me" })).statusCode, 401);
        assert.equal(
          (
            await app.inject({
              url: "/api/me",
              headers: { "x-dev-user": owner },
            })
          ).headers["cache-control"],
          "private, no-store",
        );
        assert.equal((await call(owner, "GET", "/api/me")).data.role, "user");
        assert.equal(
          (await call(owner, "GET", "/api/moderation/reports")).status,
          403,
        );
      },
    );
    await t.test(
      "family limit remains five under six concurrent accepts",
      async () => {
        assert.equal(
          (
            await call(owner, "POST", "/api/family", {
              name: "Synthetic concurrent family",
            })
          ).status,
          200,
        );
        const secrets = await Promise.all(
          Array.from({ length: 6 }, async () => {
            const res = await call(owner, "POST", "/api/family/invites");
            return res.data.token as string;
          }),
        );
        const accepts = await Promise.all(
          secrets.map((secret, i) =>
            call(`${prefix}_member${i}`, "POST", "/api/family/accept", {
              token: secret,
            }),
          ),
        );
        assert.equal(accepts.filter((r) => r.status === 200).length, 4);
        assert.equal(accepts.filter((r) => r.status === 409).length, 2);
        assert.equal(
          (await call(owner, "GET", "/api/family")).data.members.length,
          5,
        );
      },
    );
    let tableId = "";
    await t.test("active table limit serialized per account", async () => {
      const results = await Promise.all(
        Array.from({ length: 17 }, (_, i) =>
          call(owner, "POST", "/api/tables", { title: `Concurrency ${i}` }),
        ),
      );
      assert.equal(results.filter((r) => r.status === 200).length, 15);
      assert.equal(results.filter((r) => r.status === 409).length, 2);
      tableId = results.find((r) => r.status === 200)!.data.id;
    });
    await t.test(
      "table secrets and sheets stay behind server authorization",
      async () => {
        await call(owner, "PATCH", `/api/tables/${tableId}`, {
          secretNotes: "PRIVATE_GM_SECRET",
        });
        assert.equal(
          (await call(other, "GET", `/api/tables/${tableId}`)).status,
          404,
        );
        const invite = await call(
          owner,
          "POST",
          `/api/tables/${tableId}/invites`,
          { role: "player" },
        );
        await call(other, "POST", "/api/tables/accept", {
          token: invite.data.token,
        });
        const detail = await call(other, "GET", `/api/tables/${tableId}`);
        assert.equal(
          JSON.stringify(detail.data).includes("PRIVATE_GM_SECRET"),
          false,
        );
        const sheet = await call(
          owner,
          "POST",
          `/api/tables/${tableId}/sheets`,
          {
            name: "Owner",
            fields: { vida: 20 },
            secretFields: { history: "SHEET_SECRET" },
          },
        );
        assert.equal(
          JSON.stringify(
            (await call(other, "GET", `/api/tables/${tableId}/sheets`)).data,
          ).includes("SHEET_SECRET"),
          false,
        );
        assert.equal(
          JSON.stringify(
            (await call(owner, "GET", `/api/tables/${tableId}/presentation`))
              .data,
          ).includes("SHEET_SECRET"),
          false,
        );
        assert.equal(
          (
            await call(other, "PUT", `/api/sheets/${sheet.data.id}`, {
              name: "Stolen",
              fields: {},
              secretFields: {},
              version: 1,
            })
          ).status,
          403,
        );
        const a = await call(owner, "PUT", `/api/sheets/${sheet.data.id}`, {
          name: "Updated",
          fields: { vida: 19 },
          secretFields: {},
          version: 1,
        });
        assert.equal(a.data.version, 2);
        assert.equal(
          (
            await call(owner, "PUT", `/api/sheets/${sheet.data.id}`, {
              name: "Stale",
              fields: {},
              secretFields: {},
              version: 1,
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "world conflict preserves prior revision and denies private access",
      async () => {
        const world = await call(owner, "POST", "/api/worlds", {
          title: "Synthetic world",
        });
        const page = await call(
          owner,
          "POST",
          `/api/worlds/${world.data.id}/pages`,
          { title: "Secret", content: "first", visibility: "private" },
        );
        assert.equal(
          (await call(other, "GET", `/api/worlds/${world.data.id}`)).status,
          404,
        );
        const update = {
          title: "Secret",
          content: "second",
          visibility: "private",
          version: 1,
        };
        const responses = await Promise.all([
          call(
            owner,
            "PUT",
            `/api/worlds/${world.data.id}/pages/${page.data.id}`,
            update,
          ),
          call(
            owner,
            "PUT",
            `/api/worlds/${world.data.id}/pages/${page.data.id}`,
            { ...update, content: "concurrent" },
          ),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        const history = await call(
          owner,
          "GET",
          `/api/worlds/${world.data.id}/pages/${page.data.id}/history`,
        );
        assert.equal(history.data.items[0].snapshot.content, "first");
      },
    );
    await t.test("gift is redeemed once with private dedication", async () => {
      const productId = randomUUID();
      await pool.query(
        "INSERT INTO products(id,title,price_cents,status) VALUES($1,'Synthetic free gift',0,'published')",
        [productId],
      );
      const gift = await call(owner, "POST", "/api/gifts", {
        productId,
        dedication: "PRIVATE_DEDICATION",
      });
      const outcomes = await Promise.all([
        call(other, "POST", "/api/gifts/redeem", { token: gift.data.token }),
        call(other, "POST", "/api/gifts/redeem", { token: gift.data.token }),
      ]);
      assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        JSON.stringify(
          (await call(other, "GET", "/api/library")).data,
        ).includes("PRIVATE_DEDICATION"),
        false,
      );
      assert.equal(
        (await call(other, "GET", `/api/library/${productId}/personal-copy`))
          .data.copy.dedication,
        "PRIVATE_DEDICATION",
      );
      assert.equal(
        (await call(owner, "GET", `/api/library/${productId}/personal-copy`))
          .data.copy,
        null,
      );
    });
    await t.test(
      "family borrowed access is revoked online immediately after removal",
      async () => {
        const product = randomUUID();
        await pool.query(
          "INSERT INTO products(id,title,status) VALUES($1,'Borrowed synthetic book','published')",
          [product],
        );
        await pool.query(
          "INSERT INTO entitlements(id,user_id,product_id,source,source_reference) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), owner, product, "test", randomUUID()],
        );
        const family = await call(owner, "GET", "/api/family"),
          member = family.data.members.find(
            (m: { id: string }) => m.id !== owner,
          ).id;
        assert.equal(
          (await call(member, "GET", `/api/library/${product}/reading`)).status,
          200,
        );
        await call(owner, "DELETE", `/api/family/members/${member}`);
        assert.equal(
          (await call(member, "GET", `/api/library/${product}/reading`)).status,
          403,
        );
        assert.equal(
          (await call(owner, "GET", `/api/library/${product}/reading`)).status,
          200,
        );
      },
    );
    await t.test(
      "beta feedback and table remain pinned through editorial version update",
      async () => {
        const pub = randomUUID(),
          product = randomUUID(),
          v1 = randomUUID(),
          v2 = randomUUID();
        await pool.query(
          "INSERT INTO publishers(id,owner_id,name) VALUES($1,$2,$3)",
          [pub, owner, "Beta synthetic publisher"],
        );
        await pool.query(
          "INSERT INTO products(id,publisher_id,title) VALUES($1,$2,$3)",
          [product, pub, "Beta synthetic product"],
        );
        for (const [id, label] of [
          [v1, "1"],
          [v2, "2"],
        ])
          await pool.query(
            "INSERT INTO product_versions(id,product_id,label,object_key,sha256,size_bytes,validated_at) VALUES($1,$2,$3,$4,$5,1,now())",
            [id, product, label, `test-only/${id}`, "a".repeat(64)],
          );
        const beta = await call(owner, "POST", `/api/publishers/${pub}/betas`, {
          productId: product,
          versionId: v1,
          title: "Pinned beta",
          access: "open",
          endPolicy: "expires",
        });
        await call(other, "POST", `/api/betas/${beta.data.id}/join`);
        await call(owner, "POST", `/api/betas/${beta.data.id}/join`);
        assert.equal(
          (
            await call(owner, "POST", `/api/tables/${tableId}/beta`, {
              betaId: beta.data.id,
              versionId: v1,
            })
          ).status,
          200,
        );
        await call(owner, "PATCH", `/api/betas/${beta.data.id}`, {
          versionId: v2,
        });
        const feedback = await call(
          other,
          "POST",
          `/api/betas/${beta.data.id}/feedback`,
          { body: "Version one feedback", page: 1 },
        );
        assert.equal(feedback.data.version_id, v1);
        assert.equal(
          (
            await pool.query(
              "SELECT pinned_version_id FROM table_betas WHERE table_id=$1",
              [tableId],
            )
          ).rows[0].pinned_version_id,
          v1,
        );
        assert.equal(
          (await call(other, "GET", `/api/library/${product}/reading`)).status,
          200,
        );
        await call(owner, "PATCH", `/api/betas/${beta.data.id}`, {
          state: "closed",
        });
        assert.equal(
          (await call(other, "GET", `/api/library/${product}/reading`)).status,
          403,
        );
      },
    );
    await t.test(
      "print private recipient address, proof ownership, approval and shipping gates",
      async () => {
        process.env.PRINT_ADDRESS_ENCRYPTION_KEY = "b".repeat(64);
        const pub = randomUUID(),
          product = randomUUID();
        await pool.query(
          "INSERT INTO publishers(id,owner_id,name) VALUES($1,$2,$3)",
          [pub, owner, "Print synthetic publisher"],
        );
        await pool.query(
          "INSERT INTO products(id,publisher_id,title) VALUES($1,$2,$3)",
          [product, pub, "Print synthetic product"],
        );
        await pool.query(
          "INSERT INTO entitlements(id,user_id,product_id,source,source_reference) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), other, product, "test", randomUUID()],
        );
        const job = await call(other, "POST", "/api/print", {
          productId: product,
        });
        let version = 1;
        const transition = async (
          user: string,
          status: string,
          extras: Record<string, unknown> = {},
        ) => {
          const res = await call(
            user,
            "POST",
            `/api/print/${job.data.id}/transition`,
            { status, version, ...extras },
          );
          if (res.status === 200) version = res.data.version;
          return res;
        };
        assert.equal((await transition(owner, "in_production")).status, 409);
        assert.equal((await transition(owner, "awaiting_proof")).status, 200);
        assert.equal(
          (
            await transition(owner, "awaiting_approval", {
              proofKey: `objects/${pub}/fake`,
            })
          ).status,
          400,
        );
        const proofId = randomUUID(),
          proof = `objects/${pub}/${proofId}/` + "a".repeat(64);
        await pool.query(
          "INSERT INTO upload_intents(id,owner_id,tenant_id,storage_class,intent,state,reserved_bytes,published_key,expires_at,print_job_id) VALUES($1,$2,$3,'publishing','{}','published',100,$4,now()+interval '1 hour',$5)",
          [proofId, owner, pub, proof, job.data.id],
        );
        assert.equal(
          (await transition(owner, "awaiting_approval", { proofKey: proof }))
            .status,
          200,
        );
        assert.equal((await transition(owner, "approved")).status, 403);
        assert.equal((await transition(other, "approved")).status, 200);
        const link = await call(
          other,
          "POST",
          `/api/print/${job.data.id}/address-link`,
        );
        const address = {
          recipient: "Synthetic Recipient",
          postalCode: "01001000",
          street: "Synthetic Street",
          number: "10",
          district: "Centro",
          city: "São Paulo",
          state: "SP",
          country: "BR",
        };
        const supplied = await app.inject({
          method: "PUT",
          url: `/api/print/address/${link.data.token}`,
          payload: { address, version: 0 },
        });
        assert.equal(supplied.statusCode, 200);
        const publicInfo = await app.inject({
          url: `/api/print/address/${link.data.token}`,
        });
        assert.equal(
          JSON.stringify(publicInfo.json()).includes("Synthetic Recipient"),
          false,
        );
        assert.equal(
          (
            await call(
              other,
              "GET",
              `/api/print/${job.data.id}/shipping-address`,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await call(
              owner,
              "GET",
              `/api/print/${job.data.id}/shipping-address`,
            )
          ).data.address.recipient,
          "Synthetic Recipient",
        );
        const stored = (
          await pool.query(
            "SELECT encrypted_address FROM print_addresses WHERE print_job_id=$1",
            [job.data.id],
          )
        ).rows[0];
        assert.equal(
          JSON.stringify(stored).includes("Synthetic Recipient"),
          false,
        );
        assert.equal((await transition(owner, "in_production")).status, 200);
        assert.equal((await transition(owner, "produced")).status, 200);
        assert.equal(
          (
            await transition(owner, "shipped", {
              tracking: "Manual synthetic tracking receipt",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await app.inject({
              method: "PUT",
              url: `/api/print/address/${link.data.token}`,
              payload: { address, version: 1 },
            })
          ).statusCode,
          409,
        );
        delete process.env.PRINT_ADDRESS_ENCRYPTION_KEY;
      },
    );
    await t.test(
      "development PDF fixture is authorized and cannot serve arbitrary files",
      async () => {
        const id = "20000000-0000-4000-8000-000000000001";
        await pool.query(
          "INSERT INTO products(id,title,status) VALUES($1,'Synthetic PDF fixture','published') ON CONFLICT DO NOTHING",
          [id],
        );
        assert.equal(
          (await call(other, "GET", `/api/development/books/${id}/content`))
            .status,
          403,
        );
        await pool.query(
          "INSERT INTO entitlements(id,user_id,product_id,source,source_reference) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), other, id, "test", randomUUID()],
        );
        const pdf = await app.inject({
          url: `/api/development/books/${id}/content`,
          headers: { "x-dev-user": other },
        });
        assert.equal(pdf.statusCode, 200);
        assert.equal(pdf.rawPayload.subarray(0, 5).toString(), "%PDF-");
        assert.equal(pdf.headers["cache-control"], "private, no-store");
        assert.equal(
          (
            await call(
              other,
              "GET",
              `/api/development/books/${randomUUID()}/content`,
            )
          ).status,
          404,
        );
        process.env.DEV_AUTH_ENABLED = "false";
        assert.equal(
          (await call(other, "GET", `/api/development/books/${id}/content`))
            .status,
          404,
        );
        process.env.DEV_AUTH_ENABLED = "true";
      },
    );
    await t.test(
      "cosmetics cannot double spend points under concurrent requests",
      async () => {
        await pool.query(
          "INSERT INTO point_accounts(user_id,balance) VALUES($1,100)",
          [owner],
        );
        const cosmeticA = randomUUID(),
          cosmeticB = randomUUID();
        for (const id of [cosmeticA, cosmeticB])
          await pool.query(
            "INSERT INTO cosmetics(id,title,cost) VALUES($1,'Synthetic cosmetic',100)",
            [id],
          );
        const outcomes = await Promise.all([
          call(owner, "POST", `/api/points/redeem/${cosmeticA}`),
          call(owner, "POST", `/api/points/redeem/${cosmeticB}`),
        ]);
        assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409]);
        assert.equal((await call(owner, "GET", "/api/points")).data.balance, 0);
      },
    );
    await t.test(
      "publisher tenant isolation and no publication without validated files",
      async () => {
        const pub = await call(owner, "POST", "/api/publishers", {
          name: "Synthetic Publisher",
          familyLicenseAccepted: true,
        });
        assert.equal(
          (await call(other, "GET", `/api/publishers/${pub.data.id}/products`))
            .status,
          404,
        );
        const product = await call(
          owner,
          "POST",
          `/api/publishers/${pub.data.id}/products`,
          { title: "Unready" },
        );
        assert.equal(
          (
            await call(
              owner,
              "POST",
              `/api/publishers/${pub.data.id}/products/${product.data.id}/status`,
              { status: "published", reason: "Test" },
            )
          ).status,
          409,
        );
      },
    );
  },
);
