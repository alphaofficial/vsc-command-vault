declare module "node:fs/promises" {
  export function mkdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<string | undefined>;

  export function readFile(
    path: string,
    options: { encoding: "utf8" },
  ): Promise<string>;

  export function writeFile(
    path: string,
    data: string,
    options?: { encoding?: "utf8" },
  ): Promise<void>;
}
