const readline = require("readline");
const {
  backupMaisRecente,
  restaurarBackupMaisRecente,
} = require("./backup-core");

function perguntar(texto) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(texto, (resposta) => {
      rl.close();
      resolve(resposta);
    });
  });
}

async function main() {
  console.log("====================================");
  console.log(" Restore local - Nio-OS");
  console.log("====================================");

  const backup = backupMaisRecente();

  console.log("");
  console.log("Backup mais recente encontrado:");
  console.log(backup.caminho);
  console.log("");
  console.log("ATENÇÃO:");
  console.log("Este processo vai restaurar o banco e substituir public/uploads e storage.");
  console.log("As pastas atuais serão renomeadas antes da restauração.");
  console.log("");

  const resposta = await perguntar(
    'Para confirmar, digite exatamente "RESTAURAR": '
  );

  if (String(resposta).trim() !== "RESTAURAR") {
    console.log("");
    console.log("Restauração cancelada.");
    return;
  }

  const resultado = restaurarBackupMaisRecente();

  console.log("");
  console.log("====================================");
  console.log(" Restore concluído com sucesso!");
  console.log("====================================");
  console.log(resultado.backup.caminho);
}

main().catch((error) => {
  console.error("");
  console.error("ERRO AO RESTAURAR BACKUP:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
