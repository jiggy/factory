import { randomUUID } from "node:crypto";
import { lstat, rename } from "node:fs/promises";
import { join } from "node:path";
import { digest, directory, entries, exists, replaceText, syncDirectory, textFile } from "./files.ts";
import { FactoryError } from "./errors.ts";

export const lanes = ["inbox", "ready", "doing", "review", "blocked", "done"] as const;
export type Lane = typeof lanes[number];
export interface Card { id: string; lane: Lane; name: string; text: string; digest: string }
const identity = /^<!-- factory:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}) -->\r?\n/;
const marker = "<!-- factory:";

export const cardPath = (root: string, card: Pick<Card, "lane" | "name">) => join(root, "board", card.lane, card.name);

export async function scanBoard(root: string, assignIdentities = false): Promise<Card[]> {
  await directory(join(root, "board"));
  const cards: Card[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const lane of lanes) {
    const path = join(root, "board", lane);
    await directory(path);
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
      let text = await textFile(fullPath, 131_072);
      let match = identity.exec(text);
      if (!match && text.startsWith(marker)) {
        throw new FactoryError("INVALID_CARD_ID", "A card has a malformed factory identity. Restore its original identity.");
      }
      if (!match && assignIdentities && (lane === "inbox" || lane === "ready")) {
        if (!text.trim()) throw new FactoryError("EMPTY_CARD", "Write task intent before submitting a card.");
        text = `<!-- factory:${randomUUID()} -->\n${text}`;
        await replaceText(fullPath, text);
        match = identity.exec(text);
      }
      if (!match) {
        throw new FactoryError("UNRECONCILED_CARD", "A card needs intake reconciliation in inbox or ready before it can enter an execution lane.");
      }
      const id = match[1]!;
      const normalized = name.normalize("NFC").toLowerCase();
      if (ids.has(id) || names.has(normalized)) {
        throw new FactoryError("DUPLICATE_CARD", "Duplicate card identities or filenames exist across the board. Resolve the copies before execution.");
      }
      ids.add(id); names.add(normalized);
      cards.push({ id, lane, name, text, digest: digest(text) });
    }
  }
  return cards;
}

export async function moveCard(root: string, card: Card, lane: Lane): Promise<Card> {
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
