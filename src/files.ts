import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { FactoryError } from "./errors.ts";

export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

export async function directory(path: string, privateMode = false): Promise<void> {
  await mkdir(path, { recursive: true, mode: privateMode ? 0o700 : 0o755 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new FactoryError("UNSAFE_PATH", "Expected a real directory, not a link or special file.");
  }
  if (privateMode && (stat.mode & 0o077) !== 0) {
    throw new FactoryError("PRIVATE_STATE_PERMISSIONS", "Application state must be private to its owner (mode 0700).");
  }
}

export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function textFile(path: string, maxBytes = 1_048_576): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > maxBytes) {
      throw new FactoryError("UNSAFE_FILE", "Expected a bounded regular file with one link.");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const named = await lstat(path);
    if (bytes.byteLength > maxBytes || before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
        after.ino !== named.ino || after.dev !== named.dev || named.isSymbolicLink()) {
      throw new FactoryError("FILE_CHANGED", "A file changed while being read. Reconcile after the editor finishes saving.");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { await handle.close(); }
}

/** One exclusive, durable record. Never replaces an existing decision or transaction. */
export async function record(path: string, value: unknown): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally { await handle.close(); }
  try {
    // Linking the fully written inode publishes atomically without replacement.
    await link(temporary, path);
  } finally { await unlink(temporary); }
  await syncDirectory(dirname(path));
}

export async function replaceText(path: string, text: string): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temporary, path); await syncDirectory(dirname(path)); }
  finally { await unlink(temporary).catch(error => { if (!isMissing(error)) throw error; }); }
}

export async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if (isMissing(error)) return false; throw error; }
}

export async function entries(path: string): Promise<string[]> {
  return (await readdir(path)).sort();
}
