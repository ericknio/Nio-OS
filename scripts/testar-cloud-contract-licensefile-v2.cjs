"use strict";

const assert = require("node:assert/strict");
const {
  assertRegisterOrLoginResponse,
  assertSyncResponse
} = require("../desktop/cloud-contract-v1.cjs");

const prettyLicense = JSON.stringify({
  schema: 1,
  payload: {
    product: "Nio-OS",
    clientName: "Cliente Teste"
  },
  signature: "x".repeat(64)
}, null, 2) + "\r\n";

const token = "nio_device_" + "A".repeat(64);

const auth = assertRegisterOrLoginResponse({
  deviceToken: token,
  status: "ACTIVE",
  licenseFile: prettyLicense,
  syncAfterSeconds: 3600
});

assert.equal(auth.licenseFile, prettyLicense);

const sync = assertSyncResponse({
  status: "ACTIVE",
  reason: null,
  licenseFile: prettyLicense,
  syncAfterSeconds: 3600
});

assert.equal(sync.licenseFile, prettyLicense);

assert.throws(
  () => assertSyncResponse({
    status: "ACTIVE",
    reason: null,
    licenseFile: prettyLicense + "\u0000",
    syncAfterSeconds: 3600
  }),
  error => error.code === "INVALID_FIELD"
);

console.log(JSON.stringify({
  ok: true,
  stage: "0.1.3-CLOUD-CONTRACT-LICENSEFILE-V2-TESTE",
  prettyJsonAccepted: true,
  crlfAccepted: true,
  nullByteRejected: true
}));
