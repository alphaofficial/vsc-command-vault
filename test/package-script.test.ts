import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "vitest";

test("buildVsixManifest escapes extension metadata", async () => {
  const { buildVsixManifest } = await import("../scripts/package.mjs");
  const manifest = buildVsixManifest({
    name: "vault",
    version: "1.2.3",
    publisher: "acme & co",
    displayName: "Command <Vault>",
    description: 'Run "quoted" commands',
    categories: ["Other"],
    engines: {
      vscode: "^1.96.0",
    },
  });

  assert.match(manifest, /acme &amp; co/);
  assert.match(manifest, /Command &lt;Vault&gt;/);
  assert.match(manifest, /Run &quot;quoted&quot; commands/);
  assert.match(manifest, /Microsoft\.VisualStudio\.Code\.Manifest/);
});

test("createVsixArchive writes a VSIX with extension payload", async () => {
  const { createVsixArchive } = await import("../scripts/package.mjs");
  const repoRoot = await mkdtemp(join(tmpdir(), "command-vault-package-test-"));

  try {
    await mkdir(join(repoRoot, "out"), { recursive: true });
    await mkdir(join(repoRoot, "resources"), { recursive: true });
    await writeFile(
      join(repoRoot, "package.json"),
      JSON.stringify(
        {
          name: "command-vault",
          version: "0.0.1",
          publisher: "albertmacmini",
          displayName: "Command Vault",
          description: "Packaged test extension.",
          categories: ["Other"],
          engines: {
            vscode: "^1.96.0",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(repoRoot, "out", "extension.js"),
      "exports.activate = () => {};\n",
      "utf8",
    );
    await writeFile(
      join(repoRoot, "resources", "command-vault.svg"),
      "<svg />\n",
      "utf8",
    );

    const archivePath = await createVsixArchive(repoRoot);
    const listing = await runCommand("/usr/bin/unzip", ["-l", archivePath]);
    const manifest = await runCommand("/usr/bin/unzip", [
      "-p",
      archivePath,
      "extension.vsixmanifest",
    ]);
    const packageJson = JSON.parse(
      await runCommand("/usr/bin/unzip", [
        "-p",
        archivePath,
        "extension/package.json",
      ]),
    );

    assert.equal(packageJson.name, "command-vault");
    assert.match(listing, /\[Content_Types\]\.xml/);
    assert.match(listing, /extension\.vsixmanifest/);
    assert.match(listing, /extension\/out\/extension\.js/);
    assert.match(listing, /extension\/resources\/command-vault\.svg/);
    assert.match(manifest, /Packaged test extension\./);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}
