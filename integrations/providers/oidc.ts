import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type JWTPayload,
} from "jose";
export interface OidcConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  clientSecret?: string;
}
export interface OidcFlow {
  state: string;
  nonce: string;
  verifier: string;
  createdAt: number;
  redirectUri: string;
}
export interface OidcFlowStore {
  save(flow: OidcFlow): Promise<void>;
  consume(state: string): Promise<OidcFlow | null>;
}
interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
}
const secret = () => randomBytes(32).toString("base64url");
function httpsUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("OIDC requires HTTPS endpoints");
  return url.toString();
}
export class OidcProvider {
  private metadata?: Discovery;
  constructor(
    private config: OidcConfig,
    private store: OidcFlowStore,
    private request: typeof fetch = fetch,
  ) {
    httpsUrl(config.issuer);
    if (!config.clientId || !config.redirectUri)
      throw new Error("OIDC configuration missing");
    const redirect = new URL(config.redirectUri);
    if (
      redirect.protocol !== "https:" &&
      !(
        redirect.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname)
      )
    )
      throw new Error(
        "Web OIDC redirect requires HTTPS or loopback development",
      );
  }
  private async discover() {
    if (this.metadata) return this.metadata;
    const response = await this.request(
      `${this.config.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
      { signal: AbortSignal.timeout(15000), redirect: "error" },
    );
    if (!response.ok)
      throw new Error(`OIDC discovery failed (${response.status})`);
    const metadata = (await response.json()) as Discovery;
    if (metadata.issuer !== this.config.issuer)
      throw new Error("OIDC discovery issuer mismatch");
    for (const endpoint of [
      metadata.authorization_endpoint,
      metadata.token_endpoint,
      metadata.jwks_uri,
    ])
      httpsUrl(endpoint);
    this.metadata = metadata;
    return metadata;
  }
  async begin() {
    const metadata = await this.discover();
    const flow: OidcFlow = {
      state: secret(),
      nonce: secret(),
      verifier: secret(),
      createdAt: Date.now(),
      redirectUri: this.config.redirectUri,
    };
    await this.store.save(flow);
    const url = new URL(metadata.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      redirect_uri: flow.redirectUri,
      scope: "openid profile email",
      state: flow.state,
      nonce: flow.nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256")
        .update(flow.verifier)
        .digest("base64url"),
    }).toString();
    return { authorizationUrl: url.toString(), state: flow.state };
  }
  async callback(input: {
    state: string;
    code: string;
    browserState: string;
  }): Promise<{
    claims: JWTPayload;
    tokens: {
      access_token: string;
      refresh_token?: string;
      id_token: string;
      expires_in?: number;
    };
  }> {
    if (
      !input.state ||
      Buffer.byteLength(input.state) !==
        Buffer.byteLength(input.browserState) ||
      !timingSafeEqual(
        Buffer.from(input.state),
        Buffer.from(input.browserState),
      )
    )
      throw new Error("OIDC browser state mismatch");
    const flow = await this.store.consume(input.state); // Atomic destructive read, before network work.
    if (
      !flow ||
      flow.state !== input.state ||
      Date.now() - flow.createdAt > 600000 ||
      flow.createdAt > Date.now() ||
      !input.code
    )
      throw new Error("Expired or replayed OIDC flow");
    const metadata = await this.discover();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      code: input.code,
      redirect_uri: flow.redirectUri,
      code_verifier: flow.verifier,
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (this.config.clientSecret)
      headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`).toString("base64")}`;
    const response = await this.request(metadata.token_endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`OIDC token exchange failed (${response.status})`);
    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token: string;
      expires_in?: number;
    };
    if (!tokens.id_token || !tokens.access_token)
      throw new Error("OIDC tokens missing");
    const { payload } = await jwtVerify(
      tokens.id_token,
      createRemoteJWKSet(new URL(metadata.jwks_uri), {
        [customFetch]: this.request,
      }),
      {
        issuer: this.config.issuer,
        audience: this.config.clientId,
        algorithms: ["RS256", "ES256"],
        requiredClaims: ["exp", "iat", "sub", "nonce"],
        maxTokenAge: "10m",
      },
    );
    if (
      payload.nonce !== flow.nonce ||
      (Array.isArray(payload.aud) &&
        payload.aud.length > 1 &&
        payload.azp !== this.config.clientId) ||
      (payload.azp && payload.azp !== this.config.clientId)
    )
      throw new Error("OIDC nonce or authorized party mismatch");
    return { claims: payload, tokens };
  }
  async revoke(refreshToken: string) {
    const metadata = await this.discover();
    if (!metadata.revocation_endpoint)
      throw new Error("Issuer has no token revocation endpoint");
    httpsUrl(metadata.revocation_endpoint);
    const body = new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: this.config.clientId,
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (this.config.clientSecret)
      headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`).toString("base64")}`;
    const response = await this.request(metadata.revocation_endpoint, {
      method: "POST",
      body,
      headers,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`OIDC revocation failed (${response.status})`);
  }
  async logoutUrl(idToken: string, postLogoutRedirect: string, state: string) {
    const metadata = await this.discover();
    if (!metadata.end_session_endpoint)
      throw new Error("Issuer has no end-session endpoint");
    const url = new URL(httpsUrl(metadata.end_session_endpoint));
    url.search = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: postLogoutRedirect,
      state,
    }).toString();
    return url.toString();
  }
}
