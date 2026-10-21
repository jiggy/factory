import { randomUUID } from "node:crypto";
import { lstat, rename } from "node:fs/promises";
import { join } from "node:path";
import { digest, entries, exists, replaceText, requireDirectory, syncDirectory, textFile } from "./files.ts";
import { FactoryError } from "./errors.ts";
import { planIntake } from "./analysis.ts";

export const lanes = ["inbox", "ready", "doing", "review", "blocked", "done"] as const;
export type Lane = typeof lanes[number];
export interface ObservedCard { id: string | null; lane: Lane; name: string; text: string; digest: string }
export interface Card extends ObservedCard { id: string }
const identity = /^<!-- factory:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}) -->\r?\n/;
const marker = "<!-- factory:";

export const cardPath = (root: string, card: Pick<Card, "lane" | "name">) => join(root, "board", card.lane, card.name);

/** Observation never creates directories, assigns IDs or acquires a write lock. */
export async function observeBoard(root: string): Promise<ObservedCard[]> {
  if (!(await exists(join(root, "board")))) {
    throw new FactoryError("WORKSPACE_NOT_INITIALIZED", "Initialize the workspace before observing its board.");
  }
  await requireDirectory(join(root, "board"));
  const cards: ObservedCard[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const lane of lanes) {
    const path = join(root, "board", lane);
    if (!(await exists(path))) throw new FactoryError("INCOMPLETE_BOARD", "A board lane is missing. Use init to restore the workspace structure.");
    await requireDirectory(path);
    for (const name of await entries(path)) {
      if (name.startsWith(".") || !name.endsWith(".md")) continue;
      if (/[\u0000-\u001f\u007f]/.test(name)) {
        throw new FactoryError("UNSAFE_CARD_NAME", "Card filenames cannot contain terminal control characters.");
      }
      const fullPath = join(path, name);
      const stat = await lstat(fullPath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new FactoryError("UNSAFE_CARD", "Board cards must be regular Markdown files, not links or directories.");
      }
      const text = await textFile(fullPath, 131_072);
      const match = identity.exec(text);
      if (!match && text.startsWith(marker)) {
        throw new FactoryError("INVALID_CARD_ID", "A card has a malformed factory identity. Restore its original identity.");
      }
      const id = match?.[1] ?? null;
      const normalized = name.normalize("NFC").toLowerCase();
      if ((id !== null && ids.has(id)) || names.has(normalized)) {
        throw new FactoryError("DUPLICATE_CARD", "Duplicate card identities or filenames exist across the board. Resolve the copies before execution.");
      }
      if (id !== null) ids.add(id);
      names.add(normalized);
      cards.push({ id, lane, name, text, digest: digest(text) });
    }
  }
  return cards;
}

/** Called only under the controller's mutation lock. No dispatch or acceptance. */
export async function reconcileBoard(root: string): Promise<Card[]> {
  const cards = await observeBoard(root);
  for (const card of planIntake(cards)) {
    if (digest(await textFile(cardPath(root, card), 131_072)) !== card.digest) {
      throw new FactoryError("CARD_CHANGED", "The card changed before reconciliation. Let the editor finish and reconcile again.");
    }
    await replaceText(cardPath(root, card), `<!-- factory:${randomUUID()} -->\n${card.text}`);
  }
  const reconciled = await observeBoard(root);
  if (reconciled.some(card => card.id === null)) {
    throw new FactoryError("CARD_CHANGED", "New task material appeared during reconciliation. Reconcile again before execution.");
  }
  return reconciled as Card[];
}

export async function moveCard(root: string, card: ObservedCard, lane: Lane): Promise<ObservedCard> {
  const source = cardPath(root, card);
  const target = cardPath(root, { ...card, lane });
  if (digest(await textFile(source, 131_072)) !== card.digest) {
    throw new FactoryError("CARD_CHANGED", "The card changed. Its captured attempt cannot complete the new revision.");
  }
  if (await exists(target)) throw new FactoryError("LANE_CONFLICT", "The destination already contains this card. Reconcile the board.");
  const from = await lstat(join(root, "board", card.lane));
  const to = await lstat(join(root, "board", lane));
  if (from.dev !== to.dev) throw new FactoryError("CROSS_DEVICE_BOARD", "All board lanes must use the same filesystem.");
  await rename(source, target);
  await syncDirectory(join(root, "board", card.lane));
  await syncDirectory(join(root, "board", lane));
  return { ...card, lane };
}
