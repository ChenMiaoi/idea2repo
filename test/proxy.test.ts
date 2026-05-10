import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMacosScutilProxyOutput, proxyEnvForChild, proxySummary, readProxyEnvironment, redactProxyUrl } from "../src/proxy.js";

test("proxy environment reads standard upper and lower case variables", () => {
  const proxy = readProxyEnvironment({
    https_proxy: "http://127.0.0.1:7890",
    no_proxy: "localhost,127.0.0.1"
  });
  assert.equal(proxy.enabled, true);
  assert.equal(proxy.source, "env");
  assert.equal(proxy.httpsProxy, "http://127.0.0.1:7890");
  assert.equal(proxy.noProxy, "localhost,127.0.0.1");
});

test("proxy environment maps ALL_PROXY and normalizes child env", () => {
  const env = proxyEnvForChild({
    ALL_PROXY: "socks5://127.0.0.1:7891",
    NO_PROXY: "localhost"
  });
  assert.equal(env.HTTP_PROXY, "socks5://127.0.0.1:7891");
  assert.equal(env.HTTPS_PROXY, "socks5://127.0.0.1:7891");
  assert.equal(env.http_proxy, "socks5://127.0.0.1:7891");
  assert.equal(env.https_proxy, "socks5://127.0.0.1:7891");
  assert.equal(env.NO_PROXY, "localhost");
});

test("proxy summaries redact credentials", () => {
  assert.equal(redactProxyUrl("http://user:pass@127.0.0.1:7890"), "http://<redacted>@127.0.0.1:7890/");
  assert.match(
    proxySummary({
      enabled: true,
      source: "env",
      httpsProxy: "http://user:pass@127.0.0.1:7890",
      noProxy: "localhost"
    }),
    /<redacted>/
  );
});

test("macOS scutil proxy output becomes Node proxy settings", () => {
  const proxy = parseMacosScutilProxyOutput(`<dictionary> {
  ExceptionsList : <array> {
    0 : localhost
    1 : 127.0.0.0/8
    2 : ::1
  }
  HTTPEnable : 1
  HTTPPort : 10808
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 10809
  HTTPSProxy : 127.0.0.1
}`);
  assert.equal(proxy.enabled, true);
  assert.equal(proxy.source, "macos-system");
  assert.equal(proxy.httpProxy, "http://127.0.0.1:10808");
  assert.equal(proxy.httpsProxy, "http://127.0.0.1:10809");
  assert.match(proxy.noProxy ?? "", /127\.0\.0\.1/);
});

test("macOS SOCKS proxy is used when HTTP proxies are absent", () => {
  const proxy = parseMacosScutilProxyOutput(`<dictionary> {
  SOCKSEnable : 1
  SOCKSPort : 10808
  SOCKSProxy : 127.0.0.1
}`);
  assert.equal(proxy.httpProxy, "socks5://127.0.0.1:10808");
  assert.equal(proxy.httpsProxy, "socks5://127.0.0.1:10808");
});
