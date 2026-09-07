const { createCloudClient } = require("../desktop/cloud-client-v1.cjs");

async function main() {
  const client = createCloudClient({
    baseUrl: "https://nio-os-cloud-dashboard.vercel.app"
  });
  console.log("Conectando ao Cloud em:", client.baseUrl);

  const loginInput = {
    email: "pointcell@hotmail.com",
    password: "12345678",
    installationId: "b7c3d7ea-1234-4567-89ab-cdef01234567",
    machineFingerprint: "3ea1c2a19758b15b2d12839cb6411d43ab2d7b42fcf316d10e5f2a528b095c2f",
    machineIdentityHash: "3ea1c2a19758b15b2d12839cb6411d43ab2d7b42fcf316d10e5f2a528b095c2f"
  };

  console.log("Tentando login com cliente:", loginInput.email);
  const loginRes = await client.login(loginInput);
  console.log(">>> LOGIN SUCESSO! <<<");
  console.log("Status retornado:", loginRes.status);
  console.log("SyncAfterSeconds:", loginRes.syncAfterSeconds);
  console.log("DeviceToken recebido:", loginRes.deviceToken ? loginRes.deviceToken.slice(0, 12) + "..." : "nenhum");
  console.log("Licenca recebida:", !!loginRes.licenseFile);

  const licenca = JSON.parse(loginRes.licenseFile);
  console.log("Dados da Licenca:", {
    produto: licenca.payload.product,
    cliente: licenca.payload.clientName,
    plano: licenca.payload.plan,
    emissao: licenca.payload.issuedOn,
    vencimento: licenca.payload.expiresOn,
  });

  console.log("\nTestando sincronizacao de licenca (/api/v1/license/sync)...");
  const syncRes = await client.sync(
    { installationId: loginInput.installationId },
    loginRes.deviceToken
  );
  console.log(">>> SYNC SUCESSO! <<<");
  console.log("Sync Status:", syncRes.status);
  console.log("Sync Reason:", syncRes.reason);
  console.log("Nova Licenca recebida no Sync:", !!syncRes.licenseFile);
}

main().catch(err => {
  console.error("ERRO NO TESTE:", err);
  process.exit(1);
});
