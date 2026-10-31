import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IssueitClient, IssueitError } from "../../mcp/src/client";

/**
 * Where the command line keeps its credentials and what it assumes about
 * the project you're standing in. Environment beats the saved file, and a
 * `.issueit.json` in the working tree names the project, so commands run in
 * a repository need no flags.
 */

export const HOSTED = "https://dash.issueit.app";

export type Credentials = { url: string; token: string; organisation?: { id: string; name: string } | null };

const home = () => process.env.ISSUEIT_CONFIG_HOME || path.join(os.homedir(), ".config", "issueit");
export const credentialsPath = () => path.join(home(), "credentials.json");

export function saveCredentials(creds: Credentials) {
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(credentialsPath(), `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
}

export function readCredentials(): Credentials | null {
  // The environment wins, so CI needs no file and no login step.
  const token = process.env.ISSUEIT_TOKEN?.trim();
  if (token) return { url: (process.env.ISSUEIT_URL?.trim() || HOSTED).replace(/\/+$/, ""), token };
  try {
    const saved = JSON.parse(fs.readFileSync(credentialsPath(), "utf8")) as Credentials;
    return saved?.token ? saved : null;
  } catch {
    return null;
  }
}

export function forgetCredentials(): boolean {
  try {
    fs.unlinkSync(credentialsPath());
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------- the project */

export type ProjectFile = { project?: string; url?: string };

/** `.issueit.json`, looked for here and in every directory above. */
export function findProjectFile(from = process.cwd()): { path: string; value: ProjectFile } | null {
  let dir = path.resolve(from);
  for (;;) {
    const file = path.join(dir, ".issueit.json");
    if (fs.existsSync(file)) {
      try {
        return { path: file, value: JSON.parse(fs.readFileSync(file, "utf8")) as ProjectFile };
      } catch {
        return null;
      }
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function writeProjectFile(value: ProjectFile, at = path.join(process.cwd(), ".issueit.json")) {
  fs.writeFileSync(at, `${JSON.stringify(value, null, 2)}\n`);
  return at;
}

/* --------------------------------------------------------------- client */

export class NotSignedIn extends Error {
  constructor() {
    super("Not signed in. Run `issueit login`, or set ISSUEIT_TOKEN.");
  }
}

export function client(): { api: IssueitClient; url: string } {
  const creds = readCredentials();
  if (!creds) throw new NotSignedIn();
  return { api: new IssueitClient({ baseUrl: creds.url, token: creds.token }), url: creds.url };
}

/** The project a command should act on: the flag, then the file, then nothing. */
export function defaultProject(flag?: string): string | undefined {
  return flag ?? findProjectFile()?.value.project;
}

export { IssueitError };
