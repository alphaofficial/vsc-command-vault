import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { stripTypeScriptTypes } from "node:module";

const SOURCE_ROOT = "src";
const OUTPUT_ROOT = "out";

await rm(OUTPUT_ROOT, { recursive: true, force: true });

for (const sourceFile of await collectSourceFiles(SOURCE_ROOT)) {
  const outputFile = join(
    OUTPUT_ROOT,
    relative(SOURCE_ROOT, sourceFile).replace(/\.ts$/u, ".js"),
  );
  const sourceText = await readFile(sourceFile, { encoding: "utf8" });
  const outputText = transpileToCommonJs(sourceText);

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, outputText, { encoding: "utf8" });
}

async function collectSourceFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

function transpileToCommonJs(sourceText) {
  const exportNames = [];

  let output = stripTypeScriptTypes(sourceText);
  output = output.replace(
    /import\s+\{([\s\S]*?)\}\s+from\s+"([^"]+)";/gu,
    (_, bindings, modulePath) =>
      `const {${bindings}} = require("${modulePath.replace(/\.ts$/u, ".js")}");`,
  );
  output = output.replace(
    /export\s+async function\s+([A-Za-z0-9_]+)\s*\(/gu,
    (_, name) => {
      exportNames.push(name);
      return `async function ${name}(`;
    },
  );
  output = output.replace(
    /export\s+function\s+([A-Za-z0-9_]+)\s*\(/gu,
    (_, name) => {
      exportNames.push(name);
      return `function ${name}(`;
    },
  );
  output = output.replace(
    /export\s+(const|let|var)\s+([A-Za-z0-9_]+)\s*=/gu,
    (_, declarationKind, name) => {
      exportNames.push(name);
      return `${declarationKind} ${name} =`;
    },
  );
  output = output.replace(
    /export\s+\{([\s\S]*?)\};/gu,
    (_, exportList) =>
      exportList
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const [localName, exportedName] = item
            .split(/\s+as\s+/u)
            .map((part) => part.trim());
          exportNames.push(exportedName ?? localName);
          return exportedName
            ? `const ${exportedName} = ${localName};`
            : "";
        })
        .filter(Boolean)
        .join("\n"),
  );

  const exportFooter = [...new Set(exportNames)]
    .map((name) => `exports.${name} = ${name};`)
    .join("\n");

  return [
    '"use strict";',
    'Object.defineProperty(exports, "__esModule", { value: true });',
    output.trim(),
    exportFooter,
    "",
  ].join("\n");
}
