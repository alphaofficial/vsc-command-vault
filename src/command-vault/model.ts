import { createHash } from "node:crypto";

export const COMMAND_VAULT_WORKSPACES_STORAGE_DIR = "workspaces";

export interface CommandVaultCommand {
  id: string;
  name: string;
  command: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommandValidationIssue {
  path: string;
  message: string;
}

export type CommandRecordValidationResult =
  | {
      ok: true;
      value: CommandVaultCommand;
      issues: [];
    }
  | {
      ok: false;
      issues: CommandValidationIssue[];
    };

export interface PersistedCommandsValidationResult {
  valid: CommandVaultCommand[];
  issues: CommandValidationIssue[];
}

export function createWorkspaceId(workspaceFolderPath: string): string {
  return createHash("sha256").update(workspaceFolderPath).digest("hex");
}

export function getWorkspaceStorageFilePath(workspaceId: string): string {
  return `${COMMAND_VAULT_WORKSPACES_STORAGE_DIR}/${workspaceId}.json`;
}

export function validateCommandRecord(
  value: unknown,
  recordPath = "command",
): CommandRecordValidationResult {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [{ path: recordPath, message: "must be an object" }],
    };
  }

  const issues: CommandValidationIssue[] = [];
  const id = readRequiredNonEmptyString(value, "id", recordPath, issues);
  const name = readRequiredNonEmptyString(value, "name", recordPath, issues);
  const command = readRequiredNonEmptyString(
    value,
    "command",
    recordPath,
    issues,
  );
  const description = readDescription(value, recordPath, issues);
  const createdAt = readIsoTimestamp(value, "createdAt", recordPath, issues);
  const updatedAt = readIsoTimestamp(value, "updatedAt", recordPath, issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      id,
      name,
      command,
      description,
      createdAt,
      updatedAt,
    },
    issues: [],
  };
}

export function validatePersistedCommandRecords(
  value: unknown,
  recordsPath = "commands",
): PersistedCommandsValidationResult {
  if (!Array.isArray(value)) {
    return {
      valid: [],
      issues: [{ path: recordsPath, message: "must be an array" }],
    };
  }

  const valid: CommandVaultCommand[] = [];
  const issues: CommandValidationIssue[] = [];

  value.forEach((record, index) => {
    const validation = validateCommandRecord(record, `${recordsPath}[${index}]`);

    if (validation.ok) {
      valid.push(validation.value);
      return;
    }

    issues.push(...validation.issues);
  });

  return { valid, issues };
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readRequiredNonEmptyString(
  value: Record<string, unknown>,
  key: string,
  recordPath: string,
  issues: CommandValidationIssue[],
): string {
  if (!hasOwn(value, key)) {
    issues.push({
      path: `${recordPath}.${key}`,
      message: "is required",
    });
    return "";
  }

  const fieldValue = value[key];

  if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) {
    issues.push({
      path: `${recordPath}.${key}`,
      message: "must be a non-empty string",
    });
    return "";
  }

  return fieldValue;
}

function readDescription(
  value: Record<string, unknown>,
  recordPath: string,
  issues: CommandValidationIssue[],
): string | null {
  if (!hasOwn(value, "description")) {
    issues.push({
      path: `${recordPath}.description`,
      message: "is required",
    });
    return null;
  }

  const description = value.description;

  if (description === null || typeof description === "string") {
    return description;
  }

  issues.push({
    path: `${recordPath}.description`,
    message: "must be a string or null",
  });
  return null;
}

function readIsoTimestamp(
  value: Record<string, unknown>,
  key: "createdAt" | "updatedAt",
  recordPath: string,
  issues: CommandValidationIssue[],
): string {
  if (!hasOwn(value, key)) {
    issues.push({
      path: `${recordPath}.${key}`,
      message: "is required",
    });
    return "";
  }

  const fieldValue = value[key];

  if (typeof fieldValue !== "string" || !isIsoTimestamp(fieldValue)) {
    issues.push({
      path: `${recordPath}.${key}`,
      message: "must be an ISO-8601 timestamp string",
    });
    return "";
  }

  return fieldValue;
}

function isIsoTimestamp(value: string): boolean {
  if (value.trim().length === 0 || !value.includes("T")) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}
