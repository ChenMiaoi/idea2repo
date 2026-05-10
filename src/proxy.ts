import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

export type ProxyEnvironment = {
  enabled: boolean;
  source: "env" | "macos-system" | "none";
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
};

let configuredKey = "";

export function readProxyEnvironment(env: NodeJS.ProcessEnv = process.env): ProxyEnvironment {
  const allProxy = firstSet(env.ALL_PROXY, env.all_proxy);
  const httpProxy = firstSet(env.HTTP_PROXY, env.http_proxy, allProxy);
  const httpsProxy = firstSet(env.HTTPS_PROXY, env.https_proxy, allProxy);
  const noProxy = firstSet(env.NO_PROXY, env.no_proxy);
  if (httpProxy || httpsProxy) {
    return {
      enabled: true,
      source: "env",
      ...(httpProxy ? { httpProxy } : {}),
      ...(httpsProxy ? { httpsProxy } : {}),
      ...(noProxy ? { noProxy } : {})
    };
  }
  if (env === process.env) {
    const macosProxy = readMacosSystemProxy();
    if (macosProxy.enabled) return macosProxy;
  }
  return {
    enabled: false,
    source: "none",
    ...(noProxy ? { noProxy } : {})
  };
}

export function configureProxyFromEnv(env: NodeJS.ProcessEnv = process.env): ProxyEnvironment {
  const proxy = readProxyEnvironment(env);
  if (!proxy.enabled) return proxy;
  const key = JSON.stringify(proxy);
  if (key !== configuredKey) {
    setGlobalDispatcher(
      new EnvHttpProxyAgent({
        httpProxy: proxy.httpProxy,
        httpsProxy: proxy.httpsProxy,
        noProxy: proxy.noProxy
      })
    );
    configuredKey = key;
  }
  return proxy;
}

export function proxyEnvForChild(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const proxy = readProxyEnvironment(env);
  if (!proxy.enabled && !proxy.noProxy) return { ...env };
  return {
    ...env,
    ...(proxy.httpProxy ? { HTTP_PROXY: proxy.httpProxy, http_proxy: proxy.httpProxy } : {}),
    ...(proxy.httpsProxy ? { HTTPS_PROXY: proxy.httpsProxy, https_proxy: proxy.httpsProxy } : {}),
    ...(proxy.noProxy ? { NO_PROXY: proxy.noProxy, no_proxy: proxy.noProxy } : {})
  };
}

export function proxySummary(proxy = readProxyEnvironment()): string {
  if (!proxy.enabled) return "disabled";
  const parts = [
    `source=${proxy.source}`,
    proxy.httpsProxy ? `HTTPS_PROXY=${redactProxyUrl(proxy.httpsProxy)}` : "",
    proxy.httpProxy ? `HTTP_PROXY=${redactProxyUrl(proxy.httpProxy)}` : "",
    proxy.noProxy ? `NO_PROXY=${proxy.noProxy}` : ""
  ].filter(Boolean);
  return parts.join(" ");
}

export function redactProxyUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      return `${url.protocol}//<redacted>@${url.host}${url.pathname}${url.search}${url.hash}`;
    }
    return url.toString();
  } catch {
    return value.replace(/\/\/[^/@\s]+@/, "//<redacted>@");
  }
}

function firstSet(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

function readMacosSystemProxy(): ProxyEnvironment {
  if (platform() !== "darwin") return { enabled: false, source: "none" };
  try {
    return parseMacosScutilProxyOutput(execFileSync("scutil", ["--proxy"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return { enabled: false, source: "none" };
  }
}

export function parseMacosScutilProxyOutput(output: string): ProxyEnvironment {
  const values = new Map<string, string>();
  const exceptions: string[] = [];
  let inExceptions = false;
  for (const line of output.split(/\r?\n/)) {
    if (/^\s*ExceptionsList\s+:\s+<array>/.test(line)) {
      inExceptions = true;
      continue;
    }
    if (inExceptions) {
      if (/^\s*}\s*$/.test(line)) {
        inExceptions = false;
        continue;
      }
      const exception = line.match(/^\s*\d+\s+:\s+(.+?)\s*$/)?.[1];
      if (exception) exceptions.push(exception);
      continue;
    }
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9]+)\s+:\s+(.+?)\s*$/);
    if (match) values.set(match[1]!, match[2]!);
  }

  const httpProxy = enabledProxy(values, "HTTP", "http");
  const httpsProxy = enabledProxy(values, "HTTPS", "http");
  const socksProxy = enabledProxy(values, "SOCKS", "socks5");
  const noProxy = normalizeNoProxy(exceptions);
  const resolvedHttpProxy = httpProxy ?? socksProxy;
  const resolvedHttpsProxy = httpsProxy ?? httpProxy ?? socksProxy;
  return {
    enabled: Boolean(resolvedHttpProxy || resolvedHttpsProxy),
    source: Boolean(resolvedHttpProxy || resolvedHttpsProxy) ? "macos-system" : "none",
    ...(resolvedHttpProxy ? { httpProxy: resolvedHttpProxy } : {}),
    ...(resolvedHttpsProxy ? { httpsProxy: resolvedHttpsProxy } : {}),
    ...(noProxy ? { noProxy } : {})
  };
}

function enabledProxy(values: Map<string, string>, prefix: "HTTP" | "HTTPS" | "SOCKS", protocol: "http" | "socks5"): string | undefined {
  if (values.get(`${prefix}Enable`) !== "1") return undefined;
  const host = values.get(`${prefix}Proxy`);
  const port = values.get(`${prefix}Port`);
  if (!host || !port) return undefined;
  return `${protocol}://${host}:${port}`;
}

function normalizeNoProxy(values: string[]): string | undefined {
  const normalized = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    normalized.add(value);
    if (value === "127.0.0.0/8") normalized.add("127.0.0.1");
  }
  return normalized.size ? [...normalized].join(",") : undefined;
}
