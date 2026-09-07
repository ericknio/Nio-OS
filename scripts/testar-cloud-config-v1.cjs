"use strict";

const assert = require("node:assert/strict");
const {
  CLOUD_URL_ENV,
  CLOUD_LOOPBACK_ENV,
  resolveCloudConfig
} = require("../desktop/cloud-config-v1.cjs");

function expectCode(fn, code) {
  let caught = null;
  try { fn(); } catch (error) { caught = error; }
  assert.ok(caught, `Esperava erro ${code}`);
  assert.equal(caught.code, code);
}

const disabled = resolveCloudConfig({ env: {}, isPackaged: false });
assert.deepEqual(disabled, {
  enabled: false,
  baseUrl: null,
  allowLoopbackHttp: false
});

const httpsDev = resolveCloudConfig({
  env: { [CLOUD_URL_ENV]: " https://licenca.exemplo.com/ " },
  isPackaged: false
});
assert.equal(httpsDev.enabled, true);
assert.equal(httpsDev.baseUrl, "https://licenca.exemplo.com");
assert.equal(httpsDev.allowLoopbackHttp, false);

const httpsPackaged = resolveCloudConfig({
  env: {
    [CLOUD_URL_ENV]: "https://licenca.exemplo.com/",
    [CLOUD_LOOPBACK_ENV]: "1"
  },
  isPackaged: true
});
assert.equal(httpsPackaged.baseUrl, "https://licenca.exemplo.com");
assert.equal(httpsPackaged.allowLoopbackHttp, false);

const loopbackDev = resolveCloudConfig({
  env: {
    [CLOUD_URL_ENV]: "http://127.0.0.1:8787/",
    [CLOUD_LOOPBACK_ENV]: "1"
  },
  isPackaged: false
});
assert.equal(loopbackDev.baseUrl, "http://127.0.0.1:8787");
assert.equal(loopbackDev.allowLoopbackHttp, true);

expectCode(
  () => resolveCloudConfig({
    env: {
      [CLOUD_URL_ENV]: "http://127.0.0.1:8787/",
      [CLOUD_LOOPBACK_ENV]: "1"
    },
    isPackaged: true
  }),
  "INSECURE_CLOUD_URL"
);

expectCode(
  () => resolveCloudConfig({
    env: { [CLOUD_URL_ENV]: "http://licenca.exemplo.com" },
    isPackaged: false
  }),
  "INSECURE_CLOUD_URL"
);

expectCode(
  () => resolveCloudConfig({
    env: { [CLOUD_URL_ENV]: "https://usuario:senha@licenca.exemplo.com" },
    isPackaged: false
  }),
  "INVALID_CLOUD_URL"
);

console.log(JSON.stringify({
  ok: true,
  stage: "0.1.3-CLOUD-CONFIG-V1-TESTE",
  disabledByDefault: true,
  httpsAccepted: true,
  packagedHttpsOnly: true,
  loopbackHttpDevExplicitOnly: true,
  credentialsInUrlRejected: true,
  providerAgnostic: true,
  databaseChanged: false,
  firewallChanged: false,
  buildExecuted: false
}));
