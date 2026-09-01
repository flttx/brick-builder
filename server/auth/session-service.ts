import { createHmac, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PostgresStore } from "../db/postgres-store.js";

const COOKIE_NAME = "brick_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export class SessionService {
  public constructor(private readonly store: PostgresStore, private readonly secret: string, private readonly secure: boolean) {}

  public async create(userId: string, response: ServerResponse): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    await this.store.createSession(this.hash(token), userId, new Date(Date.now() + MAX_AGE_SECONDS * 1000).toISOString());
    response.setHeader("set-cookie", `${COOKIE_NAME}=${token}; Max-Age=${MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${this.secure ? "; Secure" : ""}`);
  }

  public async userId(request: IncomingMessage): Promise<string | null> {
    const token = parseCookies(request.headers.cookie).get(COOKIE_NAME);
    if (token === undefined) return null;
    const id = this.hash(token);
    const session = await this.store.getSession(id);
    if (session === null) return null;
    await this.store.touchSession(id);
    return session.userId;
  }

  public async destroy(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const token = parseCookies(request.headers.cookie).get(COOKIE_NAME);
    if (token !== undefined) await this.store.deleteSession(this.hash(token));
    response.setHeader("set-cookie", `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${this.secure ? "; Secure" : ""}`);
  }

  private hash(token: string): string { return createHmac("sha256", this.secret).update(token).digest("hex"); }
}

const parseCookies = (header: string | undefined): Map<string, string> => new Map((header ?? "").split(";").flatMap((part) => { const [name, ...value] = part.trim().split("="); return name === undefined || value.length === 0 ? [] : [[name, value.join("=")]]; }));

