declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}
