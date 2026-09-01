export const getAllowedOrigins = (environment: NodeJS.ProcessEnv = process.env, appOrigin = environment.APP_ORIGIN): readonly string[] => {
  const origins = new Set<string>();
  const configuredOrigin = appOrigin === undefined ? undefined : normalizeOrigin(appOrigin);
  if (configuredOrigin !== undefined) origins.add(configuredOrigin);

  if (!isProductionEnvironment(environment)) {
    const configuredUrl = configuredOrigin === undefined ? undefined : new URL(configuredOrigin);
    const port = configuredUrl?.port || environment.PORT || "8787";
    if (configuredUrl !== undefined && !isLocalHostname(configuredUrl.hostname)) return [...origins];
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
    origins.add(`http://[::1]:${port}`);
  }

  if (environment.VERCEL_ENV === "preview" && environment.VERCEL_URL !== undefined) {
    const deploymentOrigin = normalizeOrigin(environment.VERCEL_URL.includes("://") ? environment.VERCEL_URL : `https://${environment.VERCEL_URL}`);
    if (deploymentOrigin !== undefined) origins.add(deploymentOrigin);
  }

  return [...origins];
};

const isLocalHostname = (hostname: string): boolean => hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";

export const isAllowedOrigin = (origin: string | undefined, allowedOrigins: readonly string[]): boolean => {
  if (origin === undefined) return true;
  const normalized = normalizeOrigin(origin);
  return normalized !== undefined && allowedOrigins.includes(normalized);
};

export const normalizeOrigin = (value: string): string | undefined => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
};

export const isProductionEnvironment = (environment: NodeJS.ProcessEnv): boolean => environment.NODE_ENV === "production" || environment.VERCEL_ENV === "preview" || environment.VERCEL_ENV === "production";
