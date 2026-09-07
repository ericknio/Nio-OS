#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const root = process.cwd();

const projectRoot = root;
const roamingRoot = path.join(
  process.env.APPDATA || "",
  "Nio-OS",
);
const localRoot = path.join(
  process.env.LOCALAPPDATA || "",
  "Nio-OS",
);

const candidateDb = path.join(
  root,
  "data",
  "nio-os-merge-preview-4a5b-2026-08-11T15-55-30-510Z.db",
);

const EXPECTED_CANDIDATE_SHA =
  "bb0bf660bfc74528ee5355af787a835aaff75e288d7fe01a022518203569d675";

const output = path.join(
  root,
  "ETAPA4A8_INSPECAO_MIDIAS_DESTINO.json",
);

const TREES = [
  ["publicUploads", "public", "uploads"],
  ["storage", "storage"],
];

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);

  try {
    while (true) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!read) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }

  return hash.digest("hex");
}

function normalizeRelative(value) {
  return value.split(path.sep).join("/");
}

function listFiles(base) {
  if (!base || !fs.existsSync(base)) return [];

  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        files.push({
          relativePath: normalizeRelative(path.relative(base, full)),
          kind: "symlink",
          sizeBytes: 0,
          sha256: null,
        });
        continue;
      }

      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      if (!entry.isFile()) continue;

      const stat = fs.statSync(full);

      files.push({
        relativePath: normalizeRelative(path.relative(base, full)),
        kind: "file",
        sizeBytes: stat.size,
        sha256: sha256File(full),
      });
    }
  }

  walk(base);

  return files.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );
}

function mapFiles(items) {
  return new Map(
    items
      .filter((item) => item.kind === "file")
      .map((item) => [item.relativePath, item]),
  );
}

function compareTree(projectFiles, roamingFiles, localFiles) {
  const p = mapFiles(projectFiles);
  const r = mapFiles(roamingFiles);
  const l = mapFiles(localFiles);

  const keys = new Set([
    ...p.keys(),
    ...r.keys(),
    ...l.keys(),
  ]);

  const entries = [];
  const summary = {
    totalPaths: keys.size,
    projectOnly: 0,
    roamingOnly: 0,
    localOnly: 0,
    sameProjectRoaming: 0,
    conflictProjectRoaming: 0,
    localMatchesProject: 0,
    localMatchesRoaming: 0,
    localConflict: 0,
  };

  for (const relativePath of [...keys].sort()) {
    const project = p.get(relativePath) || null;
    const roaming = r.get(relativePath) || null;
    const local = l.get(relativePath) || null;

    let classification = "OTHER";

    if (project && !roaming && !local) {
      summary.projectOnly += 1;
      classification = "PROJECT_ONLY";
    } else if (!project && roaming && !local) {
      summary.roamingOnly += 1;
      classification = "ROAMING_ONLY";
    } else if (!project && !roaming && local) {
      summary.localOnly += 1;
      classification = "LOCAL_ONLY";
    }

    if (project && roaming) {
      if (project.sha256 === roaming.sha256) {
        summary.sameProjectRoaming += 1;
        classification = local
          ? "PROJECT_ROAMING_SAME_WITH_LOCAL"
          : "PROJECT_ROAMING_SAME";
      } else {
        summary.conflictProjectRoaming += 1;
        classification = local
          ? "PROJECT_ROAMING_CONFLICT_WITH_LOCAL"
          : "PROJECT_ROAMING_CONFLICT";
      }
    }

    if (local && project && local.sha256 === project.sha256) {
      summary.localMatchesProject += 1;
    }

    if (local && roaming && local.sha256 === roaming.sha256) {
      summary.localMatchesRoaming += 1;
    }

    if (
      local &&
      ((project && local.sha256 !== project.sha256) ||
        (roaming && local.sha256 !== roaming.sha256)) &&
      !(project && local.sha256 === project.sha256) &&
      !(roaming && local.sha256 === roaming.sha256)
    ) {
      summary.localConflict += 1;
    }

    entries.push({
      relativePath,
      classification,
      project,
      roaming,
      local,
    });
  }

  return { summary, entries };
}

function inspectDb(file) {
  if (!file || !fs.existsSync(file)) {
    return {
      exists: false,
      path: file || null,
    };
  }

  const stat = fs.statSync(file);
  const result = {
    exists: true,
    path: file,
    sizeBytes: stat.size,
    sha256: sha256File(file),
    walExists: fs.existsSync(`${file}-wal`),
    shmExists: fs.existsSync(`${file}-shm`),
  };

  try {
    const db = new DatabaseSync(file, { readOnly: true });

    try {
      const integrity = db.prepare("PRAGMA integrity_check").all();
      const fk = db.prepare("PRAGMA foreign_key_check").all();

      result.integrityCheck =
        integrity.length === 1
          ? String(integrity[0].integrity_check)
          : integrity;
      result.foreignKeyViolations = fk.length;
      result.tableCount = Number(
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          )
          .get().c,
      );
    } finally {
      db.close();
    }
  } catch (error) {
    result.openError =
      error instanceof Error ? error.message : String(error);
  }

  return result;
}

function treeFor(baseRoot, segments) {
  return listFiles(path.join(baseRoot, ...segments));
}

function rootSummary(baseRoot) {
  return {
    root: baseRoot,
    exists: Boolean(baseRoot && fs.existsSync(baseRoot)),
    configExists: Boolean(
      baseRoot &&
        fs.existsSync(
          path.join(baseRoot, "nio-os-desktop-config.json"),
        ),
    ),
    runtimeEnvExists: Boolean(
      baseRoot &&
        fs.existsSync(path.join(baseRoot, ".env")),
    ),
    desktopLogExists: Boolean(
      baseRoot &&
        fs.existsSync(path.join(baseRoot, "nio-os-desktop.log")),
    ),
    database: inspectDb(
      baseRoot
        ? path.join(baseRoot, "data", "nio-os.db")
        : "",
    ),
  };
}

function main() {
  const candidate = inspectDb(candidateDb);

  if (!candidate.exists) {
    throw new Error(
      `Banco candidato não encontrado: ${candidateDb}`,
    );
  }

  if (candidate.sha256 !== EXPECTED_CANDIDATE_SHA) {
    throw new Error(
      `Banco candidato mudou. Esperado ${EXPECTED_CANDIDATE_SHA}, atual ${candidate.sha256}.`,
    );
  }

  if (
    candidate.integrityCheck !== "ok" ||
    candidate.foreignKeyViolations !== 0
  ) {
    throw new Error(
      "Banco candidato não passou na validação de integridade.",
    );
  }

  const trees = {};

  for (const [name, ...segments] of TREES) {
    const projectFiles = treeFor(projectRoot, segments);
    const roamingFiles = treeFor(roamingRoot, segments);
    const localFiles = treeFor(localRoot, segments);

    trees[name] = {
      roots: {
        project: path.join(projectRoot, ...segments),
        roaming: path.join(roamingRoot, ...segments),
        local: path.join(localRoot, ...segments),
      },
      counts: {
        project: projectFiles.length,
        roaming: roamingFiles.length,
        local: localFiles.length,
      },
      comparison: compareTree(
        projectFiles,
        roamingFiles,
        localFiles,
      ),
    };
  }

  const report = {
    ok: true,
    stage: "4A.8-INSPECAO-MIDIAS-DESTINO",
    generatedAt: new Date().toISOString(),
    safety: {
      readOnly: true,
      databaseChanged: false,
      schemaChanged: false,
      migrationExecuted: false,
      promotionPerformed: false,
      fileContentsExported: false,
      secretsExported: false,
    },
    environment: {
      APPDATA: process.env.APPDATA || null,
      LOCALAPPDATA: process.env.LOCALAPPDATA || null,
    },
    candidate,
    roots: {
      project: rootSummary(projectRoot),
      roaming: rootSummary(roamingRoot),
      local: rootSummary(localRoot),
    },
    trees,
  };

  fs.writeFileSync(
    output,
    JSON.stringify(report, null, 2),
    "utf8",
  );

  console.log(
    JSON.stringify({
      ok: true,
      stage: report.stage,
      report: path.basename(output),
      candidateHashOk:
        candidate.sha256 === EXPECTED_CANDIDATE_SHA,
      candidateIntegrity:
        candidate.integrityCheck,
      candidateForeignKeyViolations:
        candidate.foreignKeyViolations,
      localRootExists: report.roots.local.exists,
      publicUploads:
        trees.publicUploads.comparison.summary,
      storage:
        trees.storage.comparison.summary,
      databaseChanged: false,
      promotionPerformed: false,
    }),
  );
}

main();
