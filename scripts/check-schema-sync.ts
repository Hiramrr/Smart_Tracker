import { readFileSync } from "fs";
import { resolve } from "path";

function extractActions(source: string): string[] {
  const blocks = [...source.matchAll(/valid_action CHECK \(action IN \(([\s\S]*?)\)\s*\)/g)]
    .map((match) => match[1])
    .join("\n");
  const matches = [...blocks.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
  return [...new Set(matches.filter((value): value is string => Boolean(value)))].sort();
}

const root = process.cwd();
const sql = readFileSync(resolve(root, "sql/init.sql"), "utf8");
const dbInit = readFileSync(resolve(root, "src/lib/db-init.ts"), "utf8");

const sqlActions = extractActions(sql);
const dbInitActions = extractActions(dbInit);
const missingInSql = dbInitActions.filter((action) => !sqlActions.includes(action));
const missingInDbInit = sqlActions.filter((action) => !dbInitActions.includes(action));

if (missingInSql.length > 0 || missingInDbInit.length > 0) {
  console.error("[SchemaSync] valid_action desincronizado");
  if (missingInSql.length > 0) console.error("Faltan en sql/init.sql:", missingInSql.join(", "));
  if (missingInDbInit.length > 0) console.error("Faltan en src/lib/db-init.ts:", missingInDbInit.join(", "));
  process.exitCode = 1;
} else {
  console.log(`[SchemaSync] valid_action sincronizado (${sqlActions.length} acciones).`);
}
