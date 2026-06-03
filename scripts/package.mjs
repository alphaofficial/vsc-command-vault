import { spawn } from "node:child_process";
import { cp, lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_PACKAGE_PATHS = ["package.json", "out", "resources"];

export async function createVsixArchive(repoRoot = process.cwd()) {
  const resolvedRoot = resolve(repoRoot);
  const extensionPackage = await readExtensionPackage(resolvedRoot);
  const extensionFiles = await collectExtensionFiles(
    resolvedRoot,
    REQUIRED_PACKAGE_PATHS,
  );
  const tempDirectory = await mkdtemp(
    join(tmpdir(), "command-vault-package-"),
  );
  const stagingDirectory = join(tempDirectory, "extension");

  try {
    await mkdir(stagingDirectory, { recursive: true });

    for (const relativePath of REQUIRED_PACKAGE_PATHS) {
      await cp(join(resolvedRoot, relativePath), join(stagingDirectory, relativePath), {
        recursive: true,
      });
    }

    await writeFile(
      join(tempDirectory, "[Content_Types].xml"),
      buildContentTypesXml(extensionFiles),
      "utf8",
    );
    await writeFile(
      join(tempDirectory, "extension.vsixmanifest"),
      buildVsixManifest(extensionPackage),
      "utf8",
    );

    const distDirectory = join(resolvedRoot, "dist");
    const vsixFileName = `${extensionPackage.name}-${extensionPackage.version}.vsix`;
    const vsixFilePath = join(distDirectory, vsixFileName);

    await mkdir(distDirectory, { recursive: true });
    await rm(vsixFilePath, { force: true });
    await runZipCommand(tempDirectory, vsixFilePath);

    return vsixFilePath;
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
}

export function buildContentTypesXml(extensionFiles) {
  const extensions = new Set(["json", "vsixmanifest", "xml"]);

  for (const relativePath of extensionFiles) {
    const extension = extname(relativePath).slice(1);

    if (extension) {
      extensions.add(extension);
    }
  }

  const defaults = [...extensions]
    .sort()
    .map(
      (extension) =>
        `  <Default Extension="${escapeXml(extension)}" ContentType="${resolveContentType(extension)}" />`,
    )
    .join("\n");

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    defaults,
    "</Types>",
    "",
  ].join("\n");
}

export function buildVsixManifest(extensionPackage) {
  const categories = Array.isArray(extensionPackage.categories)
    ? extensionPackage.categories.join(",")
    : "";

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">',
    "  <Metadata>",
    `    <Identity Id="${escapeXml(extensionPackage.name)}" Version="${escapeXml(extensionPackage.version)}" Language="en-US" Publisher="${escapeXml(extensionPackage.publisher)}" />`,
    `    <DisplayName>${escapeXml(extensionPackage.displayName)}</DisplayName>`,
    `    <Description xml:space="preserve">${escapeXml(extensionPackage.description)}</Description>`,
    `    <Categories>${escapeXml(categories)}</Categories>`,
    "    <Properties>",
    `      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escapeXml(extensionPackage.engines.vscode)}" />`,
    "    </Properties>",
    "  </Metadata>",
    "  <Installation>",
    '    <InstallationTarget Id="Microsoft.VisualStudio.Code" />',
    "  </Installation>",
    "  <Dependencies />",
    "  <Assets>",
    '    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />',
    "  </Assets>",
    "</PackageManifest>",
    "",
  ].join("\n");
}

async function readExtensionPackage(repoRoot) {
  const packageJsonPath = join(repoRoot, "package.json");
  const packageJsonText = await readFile(packageJsonPath, "utf8");
  const extensionPackage = JSON.parse(packageJsonText);

  if (
    typeof extensionPackage.name !== "string" ||
    typeof extensionPackage.version !== "string" ||
    typeof extensionPackage.publisher !== "string" ||
    typeof extensionPackage.displayName !== "string" ||
    typeof extensionPackage.description !== "string" ||
    typeof extensionPackage?.engines?.vscode !== "string"
  ) {
    throw new Error(
      "package.json is missing required extension metadata for VSIX packaging.",
    );
  }

  return extensionPackage;
}

async function collectExtensionFiles(repoRoot, relativePaths) {
  const files = [];

  for (const relativePath of relativePaths) {
    files.push(...(await collectFiles(join(repoRoot, relativePath), relativePath)));
  }

  return files.sort();
}

async function collectFiles(absolutePath, relativePath) {
  const stats = await lstat(absolutePath);

  if (stats.isFile()) {
    return [relativePath];
  }

  const entries = await readdir(absolutePath, { withFileTypes: true });

  if (entries.length === 0) {
    return [];
  }

  const files = [];

  for (const entry of entries) {
    const entryAbsolutePath = join(absolutePath, entry.name);
    const entryRelativePath = join(relativePath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryAbsolutePath, entryRelativePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryRelativePath);
    }
  }

  return files;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function resolveContentType(extension) {
  switch (extension) {
    case "css":
      return "text/css";
    case "html":
      return "text/html";
    case "js":
      return "application/javascript";
    case "json":
      return "application/json";
    case "md":
      return "text/markdown";
    case "svg":
      return "image/svg+xml";
    case "txt":
      return "text/plain";
    case "vsixmanifest":
    case "xml":
      return "text/xml";
    default:
      return "application/octet-stream";
  }
}

function runZipCommand(cwd, outputPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "/usr/bin/zip",
      ["-X", "-q", "-r", outputPath, "[Content_Types].xml", "extension.vsixmanifest", "extension"],
      {
        cwd,
        stdio: "inherit",
      },
    );

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          signal === null
            ? `zip exited with code ${code ?? "unknown"}.`
            : `zip exited with signal ${signal}.`,
        ),
      );
    });
  });
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(process.argv[1]) === currentFilePath) {
  const archivePath = await createVsixArchive();
  process.stdout.write(`${archivePath}\n`);
}
