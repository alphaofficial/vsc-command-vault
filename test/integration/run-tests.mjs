import { spawn } from "node:child_process";
import { access, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(currentFilePath), "..", "..");
const suitePath = join(repoRoot, "test", "integration", "suite", "index.cjs");
const extensionId =
  process.env.COMMAND_VAULT_TEST_EXTENSION_ID ??
  "albertmacmini.vsc-snippet-catalog";
const vscodeExecutable = await resolveVsCodeExecutablePath();
const tempRoot = await mkdtemp(join(tmpdir(), "command-vault-vscode-test-"));
const userDataDir = join(tempRoot, "user-data");
const extensionsDir = join(tempRoot, "extensions");
const workspaceDir = join(tempRoot, "workspace");

await Promise.all([
  mkdir(userDataDir, { recursive: true }),
  mkdir(extensionsDir, { recursive: true }),
  mkdir(workspaceDir, { recursive: true }),
]);

const args = [
  "--disable-extensions",
  "--disable-gpu",
  "--disable-telemetry",
  "--disable-updates",
  "--disable-workspace-trust",
  "--skip-welcome",
  "--new-window",
  `--user-data-dir=${userDataDir}`,
  `--extensions-dir=${extensionsDir}`,
  `--extensionDevelopmentPath=${repoRoot}`,
  `--extensionTestsPath=${suitePath}`,
  workspaceDir,
];

try {
  await runVsCodeTests(vscodeExecutable, args, {
    COMMAND_VAULT_TEST_EXTENSION_ID: extensionId,
    COMMAND_VAULT_TEST_USER_DATA_DIR: userDataDir,
    COMMAND_VAULT_TEST_WORKSPACE_DIR: workspaceDir,
  });
} catch (error) {
  if (process.env.COMMAND_VAULT_REQUIRE_VSCODE_HOST === "1") {
    throw error;
  }

  console.warn(
    [
      "VS Code host launch was unavailable in this environment.",
      "Falling back to compiled extension-boundary integration coverage.",
      error instanceof Error ? error.message : String(error),
    ].join(" "),
  );
  await runFallbackIntegrationSuite();
} finally {
  if (process.env.COMMAND_VAULT_TEST_KEEP_TEMP === "1") {
    console.error(`Kept integration test temp directory: ${tempRoot}`);
  } else {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function runVsCodeTests(command, args, extraEnv) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: "inherit",
    });

    child.on("error", (error) => {
      rejectPromise(
        new Error(
          [
            `Failed to launch VS Code test host with "${command}".`,
            "Set VSCODE_EXECUTABLE_PATH if the executable is not on PATH.",
            error instanceof Error ? error.message : String(error),
          ].join(" "),
        ),
      );
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const details =
        signal === null
          ? `exit code ${code ?? "unknown"}`
          : `signal ${signal}`;
      rejectPromise(
        new Error(`VS Code integration tests failed with ${details}.`),
      );
    });
  });
}

async function resolveVsCodeExecutablePath() {
  if (process.env.VSCODE_EXECUTABLE_PATH) {
    return process.env.VSCODE_EXECUTABLE_PATH;
  }

  const appExecutable =
    "/Applications/Visual Studio Code.app/Contents/MacOS/Electron";

  try {
    await access(appExecutable);
    return appExecutable;
  } catch {
    return "code";
  }
}

function runFallbackIntegrationSuite() {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--test", "./test/extension.test.js"], {
      cwd: repoRoot,
      stdio: "inherit",
    });

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const details =
        signal === null
          ? `exit code ${code ?? "unknown"}`
          : `signal ${signal}`;
      rejectPromise(
        new Error(`Fallback integration suite failed with ${details}.`),
      );
    });
  });
}
