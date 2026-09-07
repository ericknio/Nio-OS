const { criarBackup } = require("./backup-core");

async function main() {
  console.log("====================================");
  console.log(" Backup local - Nio-OS");
  console.log("====================================");

  const backup = criarBackup();

  console.log("");
  console.log("====================================");
  console.log(" Backup criado com sucesso!");
  console.log("====================================");
  console.log(backup.caminho);
}

main().catch((error) => {
  console.error("");
  console.error("ERRO AO GERAR BACKUP:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
