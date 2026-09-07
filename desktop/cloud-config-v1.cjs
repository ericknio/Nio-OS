"use strict";

const { normalizeBaseUrl } = require("./cloud-client-v1.cjs");

const CLOUD_URL_ENV = "NIO_OS_CLOUD_URL";
const CLOUD_LOOPBACK_ENV = "NIO_OS_CLOUD_ALLOW_LOOPBACK_HTTP";
const DEFAULT_PRODUCTION_CLOUD_URL = "https://nio-os-cloud-dashboard.vercel.app";

function resolveCloudConfig({
  env = process.env,
  isPackaged = false
} = {}) {
  const rawUrl = typeof env?.[CLOUD_URL_ENV] === "string"
    ? env[CLOUD_URL_ENV].trim()
    : "";

  const finalUrl = rawUrl || DEFAULT_PRODUCTION_CLOUD_URL;

  const allowLoopbackHttp =
    !isPackaged &&
    String(env?.[CLOUD_LOOPBACK_ENV] || "").trim() === "1";

  return Object.freeze({
    enabled: true,
    baseUrl: normalizeBaseUrl(finalUrl, { allowLoopbackHttp }),
    allowLoopbackHttp
  });
}

module.exports = Object.freeze({
  CLOUD_URL_ENV,
  CLOUD_LOOPBACK_ENV,
  DEFAULT_PRODUCTION_CLOUD_URL,
  resolveCloudConfig
});
