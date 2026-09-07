const fs = require("fs");
const { criarBackup, listarBackups } = require("./backup-core");

const INTERVALO_HORAS = 24;
const RETENCAO_DIAS = 30;
const MINIMO_BACKUPS = 10;
const MAXIMO_BACKUPS = 60;

function horasDesde(dataIso) {
  const data = new Date(dataIso);

  if (Number.isNaN(data.getTime())) return Infinity;

  return (Date.now() - data.getTime()) / 1000 / 60 / 60;
}

function diasDesde(dataIso) {
  return horasDesde(dataIso) / 24;
}

function removerBackup(backup) {
  if (!backup?.caminho || !fs.existsSync(backup.caminho)) return false;

  fs.rmSync(backup.caminho, {
    recursive: true,
    force: true,
  });

  return true;
}

function limparBackupsAntigos() {
  const backups = listarBackups();

  if (backups.length <= MINIMO_BACKUPS) {
    console.log("");
    console.log("Limpeza de backups: nada para remover.");
    return;
  }

  let removidos = 0;

  backups.forEach((backup, index) => {
    const dentroDoMinimo = index < MINIMO_BACKUPS;
    const muitoAntigo = diasDesde(backup.criadoEm) > RETENCAO_DIAS;
    const excedeuMaximo = index >= MAXIMO_BACKUPS;

    if (dentroDoMinimo) return;
    if (!muitoAntigo && !excedeuMaximo) return;

    if (removerBackup(backup)) {
      removidos += 1;
      console.log(`Backup removido: ${backup.nome}`);
    }
  });

  console.log("");
  console.log(
    removidos > 0
      ? `Limpeza concluída: ${removidos} backup(s) removido(s).`
      : "Limpeza concluída: nenhum backup antigo encontrado."
  );
}

function deveCriarBackupAgora() {
  const backups = listarBackups();
  const ultimoBackup = backups[0] || null;

  if (!ultimoBackup) {
    console.log("Nenhum backup encontrado.");
    return true;
  }

  const horas = horasDesde(ultimoBackup.criadoEm);

  console.log(`Último backup: ${ultimoBackup.nome}`);
  console.log(`Há aproximadamente: ${horas.toFixed(1)} hora(s)`);

  return horas >= INTERVALO_HORAS;
}

function main() {
  console.log("====================================");
  console.log(" Nio-OS - Backup automático");
  console.log("====================================");
  console.log(`Frequência: 1 backup a cada ${INTERVALO_HORAS}h`);
  console.log(`Retenção: ${RETENCAO_DIAS} dias`);
  console.log(`Mínimo preservado: ${MINIMO_BACKUPS} backups`);
  console.log(`Máximo permitido: ${MAXIMO_BACKUPS} backups`);
  console.log("====================================");

  if (deveCriarBackupAgora()) {
    console.log("");
    console.log("Criando backup automático...");

    const backup = criarBackup();

    console.log("");
    console.log("Backup automático criado com sucesso:");
    console.log(backup.caminho);
  } else {
    console.log("");
    console.log("Backup automático não necessário agora.");
  }

  limparBackupsAntigos();
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("ERRO NO BACKUP AUTOMÁTICO:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
