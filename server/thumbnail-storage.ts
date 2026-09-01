import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import { join } from "node:path";
import type { ThumbnailStorage } from "../packages/project-persistence/thumbnail.js";

export class LocalFilesystemThumbnailStorage implements ThumbnailStorage {
  public constructor(private readonly directory: string) {}

  public async put(projectId: string, content: Uint8Array, contentType: "image/webp"): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${safeId(projectId)}.webp`);
    await writeFile(path, content);
    return `/media/thumbnails/${safeId(projectId)}.${contentType === "image/webp" ? "webp" : "bin"}`;
  }

  public async getUrl(projectId: string): Promise<string | null> {
    try { await readFile(join(this.directory, `${safeId(projectId)}.webp`)); return `/media/thumbnails/${safeId(projectId)}.webp`; } catch { return null; }
  }

  public async read(projectId: string): Promise<Buffer> { return readFile(join(this.directory, `${safeId(projectId)}.webp`)); }
}

export interface S3CompatibleStorageOptions {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetchImpl?: typeof fetch;
}

interface S3ThumbnailStorage extends ThumbnailStorage {
  read(projectId: string): Promise<Buffer>;
}

export class S3CompatibleThumbnailStorage implements S3ThumbnailStorage {
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: S3CompatibleStorageOptions) { this.fetchImpl = options.fetchImpl ?? fetch; }

  public async put(projectId: string, content: Uint8Array, contentType: "image/webp"): Promise<string> {
    const key = objectKey(projectId);
    const response = await this.request("PUT", key, content, contentType);
    if (!response.ok) throw new Error("Object storage upload failed");
    return `/media/thumbnails/${safeId(projectId)}.webp`;
  }

  public async getUrl(projectId: string): Promise<string | null> { return `/media/thumbnails/${safeId(projectId)}.webp`; }

  public async read(projectId: string): Promise<Buffer> {
    const response = await this.request("GET", objectKey(projectId));
    if (!response.ok) throw new Error("Object storage read failed");
    return Buffer.from(await response.arrayBuffer());
  }

  private request(method: "GET" | "PUT", key: string, body?: Uint8Array, contentType?: string): Promise<Response> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const shortDate = amzDate.slice(0, 8);
    const url = new URL(`/${encodeURIComponent(this.options.bucket)}/${key}`, ensureTrailingSlash(this.options.endpoint));
    const host = url.host;
    const payloadHash = createHash("sha256").update(body ?? new Uint8Array()).digest("hex");
    const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    if (contentType !== undefined) headers["content-type"] = contentType;
    const canonicalHeaders = Object.keys(headers).sort().map((name) => `${name}:${headers[name] as string}\n`).join("");
    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${shortDate}/${this.options.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.options.secretAccessKey}`, shortDate), this.options.region), "s3"), "aws4_request");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signingKey, stringToSign)}`;
    return this.fetchImpl(url, { method, headers, ...(body === undefined ? {} : { body }) });
  }
}

const hmac = (key: string | Buffer, value: string): Buffer => createHmac("sha256", key).update(value).digest();
const ensureTrailingSlash = (value: string): string => value.endsWith("/") ? value : `${value}/`;
const objectKey = (projectId: string): string => `thumbnails/${safeId(projectId)}.webp`;

const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");
