import { createHash, createHmac } from "node:crypto";

export interface ObjectStorage {
  put(key: string, content: Uint8Array, contentType: string, cacheControl: string): Promise<void>;
  verify(key: string): Promise<number>;
}

export interface S3ObjectStorageOptions {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  fetchImpl?: typeof fetch;
}

export class S3CompatibleObjectStorage implements ObjectStorage {
  private readonly fetchImpl: typeof fetch;
  public constructor(private readonly options: S3ObjectStorageOptions) { this.fetchImpl = options.fetchImpl ?? fetch; }
  public async put(key: string, content: Uint8Array, contentType: string, cacheControl: string): Promise<void> { const response = await this.request("PUT", key, content, contentType, cacheControl); if (!response.ok) throw new Error("Object storage upload failed"); }
  public async verify(key: string): Promise<number> { const response = await this.request("HEAD", key); if (!response.ok) throw new Error(`Object storage verification failed for ${key}`); const length = Number(response.headers.get("content-length") ?? 0); if (!Number.isFinite(length)) throw new Error(`Object storage returned an invalid content length for ${key}`); return length; }
  private request(method: "HEAD" | "PUT", key: string, body?: Uint8Array, contentType?: string, cacheControl?: string): Promise<Response> {
    const now = new Date(); const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/u, "Z"); const shortDate = amzDate.slice(0, 8); const url = objectUrl(this.options.endpoint, this.options.bucket, key, this.options.forcePathStyle ?? true); const payloadHash = createHash("sha256").update(body ?? new Uint8Array()).digest("hex"); const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate }; if (contentType !== undefined) headers["content-type"] = contentType; if (cacheControl !== undefined) headers["cache-control"] = cacheControl; const canonicalHeaders = Object.keys(headers).sort().map((name) => `${name}:${headers[name] as string}\n`).join(""); const signedHeaders = Object.keys(headers).sort().join(";"); const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n"); const scope = `${shortDate}/${this.options.region}/s3/aws4_request`; const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n"); const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.options.secretAccessKey}`, shortDate), this.options.region), "s3"), "aws4_request"); headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signingKey, stringToSign)}`; return this.fetchImpl(url, { method, headers, ...(body === undefined ? {} : { body: Buffer.from(body) }) });
  }
}

const hmac = (key: string | Buffer, value: string): string => createHmac("sha256", key).update(value).digest("hex");
const objectUrl = (endpoint: string, bucket: string, key: string, forcePathStyle: boolean): URL => { const url = new URL(endpoint); const segments = key.split("/").map(encodeURIComponent); if (forcePathStyle) url.pathname = joinPath(url.pathname, [bucket, ...segments]); else { url.hostname = `${bucket}.${url.hostname}`; url.pathname = joinPath(url.pathname, segments); } return url; };
const joinPath = (base: string, segments: string[]): string => `${base.replace(/\/+$/u, "")}/${segments.join("/")}`;
