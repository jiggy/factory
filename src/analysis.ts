import type { Card, ObservedCard } from "./board.ts";
import { FactoryError } from "./errors.ts";

export interface Decision {
  taskDigest: string;
  disposition: "review" | "blocked";
  reason: string;
}

/** Deliberately excludes Prepared, tickets, task text and provider output. */
export interface AttemptFacts {
  sequence: number;
  attemptId: string;
  task: Pick<Card, "id" | "name" | "digest">;
  decision?: Pick<Decision, "taskDigest" | "disposition">;
  acceptedDigest?: string;
  requeued: boolean;
}

export interface BoardRow {
  id: string | null;
  name: string;
  lane: string;
  attention?: string;
}

export function latestByTask<T extends { sequence: number; task: { id: string } }>(
  attempts: readonly T[],
): Map<string, T> {
  const latest = new Map<string, T>();
  for (const attempt of attempts) {
    const previous = latest.get(attempt.task.id);
    if (!previous || previous.sequence < attempt.sequence) latest.set(attempt.task.id, attempt);
  }
  return latest;
}

/** Plan only: the caller chooses IDs, rechecks source digests and commits writes. */
export function planIntake(cards: readonly ObservedCard[]): ObservedCard[] {
  const pending = cards.filter(card => card.id === null);
  for (const card of pending) {
    if (card.lane !== "inbox" && card.lane !== "ready") {
      throw new FactoryError("UNRECONCILED_CARD", "A card needs intake reconciliation in inbox or ready before it can enter an execution lane.");
    }
    if (!card.text.trim()) throw new FactoryError("EMPTY_CARD", "Write task intent before submitting a card.");
  }
  return pending;
}

function attention(card: ObservedCard, attempt: AttemptFacts | undefined, controllerActive: boolean): string | undefined {
  if (card.id === null) {
    if (!card.text.trim()) return "Empty task; write intent before reconciliation.";
    return card.lane === "inbox" || card.lane === "ready"
      ? "New task; reconcile to assign an identity."
      : "Unidentified task in an execution lane; return it to inbox or ready and reconcile.";
  }
  if (!attempt) return ["inbox", "ready"].includes(card.lane) ? undefined : "No committed attempt supports this lane.";
  if (!attempt.decision) {
    return controllerActive
      ? "Controller owns this workspace; attempt has not settled."
      : "Attempt requires observational recovery before any new execution.";
  }
  if (attempt.task.digest !== card.digest) return "Card edited since execution; retain old evidence and explicitly requeue.";
  if (attempt.decision.taskDigest !== card.digest) return "Recorded decision does not match this task revision; inspect retained evidence.";
  if (card.lane === "ready" && attempt.requeued) return undefined;
  if (card.lane === "done") {
    return attempt.acceptedDigest === card.digest ? undefined : "A manual move cannot manufacture human acceptance.";
  }
  if (card.lane !== attempt.decision.disposition && !["inbox", "ready", "blocked"].includes(card.lane)) {
    return "Manual lane change requires reconciliation; execution and acceptance facts are unchanged.";
  }
  if (card.lane === "ready") return "Previous attempt exists. Explicitly requeue before executing again.";
  return undefined;
}

/** Pure diagnosis of captured facts. It grants no authority and performs no effects. */
export function diagnoseBoard(
  cards: readonly ObservedCard[],
  attempts: readonly AttemptFacts[],
  controllerActive = false,
): BoardRow[] {
  const latest = latestByTask(attempts);
  const present = new Set(cards.flatMap(card => card.id === null ? [] : [card.id]));
  const rows: BoardRow[] = cards.map(card => {
    const message = attention(card, card.id === null ? undefined : latest.get(card.id), controllerActive);
    return { id: card.id, name: card.name, lane: card.lane, ...(message ? { attention: message } : {}) };
  });
  for (const attempt of latest.values()) {
    if (!present.has(attempt.task.id)) {
      rows.push({
        id: attempt.task.id, name: attempt.task.name, lane: "missing",
        attention: "Task file is missing; attempt evidence is retained. Use recover before new work.",
      });
    }
  }
  return rows;
}
