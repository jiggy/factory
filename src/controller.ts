import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createAttemptClient, type AttemptSubmission } from "@jigging/jig/client";
import { cardPath, lanes, moveCard, observeBoard, reconcileBoard } from "./board.ts";
import { diagnoseBoard, latestByTask, type BoardRow, type Decision } from "./analysis.ts";
import { configuration } from "./config.ts";
import { digest, directory, textFile } from "./files.ts";
import { FactoryError } from "./errors.ts";
import { Store, type Transaction } from "./store.ts";

export type ExecutionClient = ReturnType<typeof createAttemptClient>;
export type ClientFactory = (project: string) => ExecutionClient;

function approval(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof (value as { approval?: unknown }).approval !== "string") {
    throw new FactoryError("REVIEW_REQUIRED", "Review the configured Jig project and target before running the factory.");
  }
  return (value as { approval: string }).approval;
}

export class Controller {
  readonly store: Store;
  constructor(readonly root: string, readonly client: ClientFactory) {
    this.store = new Store(root);
  }

  async initialize() {
    for (const lane of lanes) await directory(join(this.root, "board", lane));
    await this.store.init();
  }

  private async latest(): Promise<Map<string, Transaction>> {
    return latestByTask(await this.store.transactions());
  }

  async status(): Promise<BoardRow[]> {
    const [cards, attempts, active] = await Promise.all([
      observeBoard(this.root), this.store.facts(), this.store.activeController(),
    ]);
    return diagnoseBoard(cards, attempts, active);
  }

  async reconcile(): Promise<BoardRow[]> {
    return this.store.locked(async () => {
      await reconcileBoard(this.root);
      return this.status();
    });
  }

  /** One ready card, one foreground episode. Never retries or automatically loops. */
  async run(cardId?: string, signal?: AbortSignal): Promise<{ attemptId: string; disposition: string }> {
    return this.store.locked(async () => {
      const cards = await reconcileBoard(this.root);
      const transactions = await this.store.transactions();
      for (const transaction of transactions) {
        if (!(await this.store.has(transaction.attemptId, "disposition.json"))) {
          throw new FactoryError("RECOVERY_REQUIRED", "An earlier attempt is unresolved. Use recover; it will not replay work.");
        }
      }
      if (cards.some(card => card.lane === "doing")) {
        throw new FactoryError("WIP_LIMIT", "A task already occupies doing. Reconcile it before starting another.");
      }
      const card = cards.find(item => item.lane === "ready" && (!cardId || item.id === cardId));
      if (!card) throw new FactoryError("NO_READY_TASK", "Move an authorized Markdown task to ready, then run again.");
      const previous = transactions.filter(item => item.task.id === card.id).at(-1);
      if (previous && !(await this.store.has(previous.attemptId, "requeue.json"))) {
        throw new FactoryError("EXPLICIT_REQUEUE_REQUIRED", "This task has prior execution evidence. Use requeue with a reason before starting a new attempt.");
      }
      const configured = await configuration(this.root);
      const client = this.client(configured.value.project);
      const expectedApproval = approval(await client.inspect({ target: configured.value.target }));
      const attemptId = randomUUID();
      const prepared = await client.prepare({
        expectedApproval,
        target: configured.value.target,
        input: { version: 1, attemptId, taskId: card.id, taskDigest: card.digest, task: card.text },
        files: [{ port: "source", source: configured.value.source, selection: configured.value.selection }],
        constraints: { durationMs: configured.value.durationMs, resultBytes: 1_048_576, artifactBytes: 33_554_432 },
        outputIntent: { packet: true, receive: ["candidate"] },
      });
      const transaction: Transaction = {
        version: 1, sequence: transactions.length + 1, attemptId, createdAt: new Date().toISOString(), task: card,
        prepared, project: configured.value.project, configurationDigest: configured.digest,
      };
      await this.store.persist(transaction);
      await this.store.event(attemptId, "claim-intent", { taskDigest: card.digest });
      const claimed = await moveCard(this.root, card, "doing");
      await this.store.save(attemptId, "claim.json", { taskDigest: card.digest });
      if (digest(await textFile(cardPath(this.root, claimed), 131_072)) !== card.digest) {
        throw new FactoryError("CARD_CHANGED", "The card changed before submission. Recover this unsubmitted preparation.");
      }
      await this.store.save(attemptId, "dispatch-intent.json", { requestDigest: prepared.requestDigest });
      let submission: AttemptSubmission | undefined;
      const cancel = () => submission?.close();
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        if (signal?.aborted) throw new FactoryError("INTERRUPTED", "Interrupted before submission. Use recover to inspect the prepared request.");
        submission = await client.submit({ ticket: prepared.ticket, request: prepared.canonicalRequest });
        await this.store.save(attemptId, "receipt.json", submission.receipt);
        if (signal?.aborted) submission.close();
        const observation = await submission.completion ?? await client.lookup({ ticket: prepared.ticket });
        await this.store.event(attemptId, "observation", observation);
        return { attemptId, disposition: await this.settle(transaction, client) };
      } catch (error) {
        await this.store.event(attemptId, "interrupted", { code: "RECOVERY_REQUIRED" });
        throw error;
      } finally {
        signal?.removeEventListener("abort", cancel);
        submission?.close();
      }
    });
  }

  private async settle(transaction: Transaction, client: ExecutionClient): Promise<string> {
    const id = transaction.attemptId;
    const retained = await client.result({ ticket: transaction.prepared.ticket });
    await this.store.event(id, "retained-observation", retained);
    const observation = retained.observation;
    if (observation.receipt && (
      observation.receipt.requestDigest !== transaction.prepared.requestDigest ||
      observation.receipt.target !== transaction.prepared.canonicalRequest.target ||
      observation.receipt.approval !== transaction.prepared.canonicalRequest.expectedApproval
    )) throw new FactoryError("RECEIPT_CONFLICT", "Host receipt does not match the captured attempt. Do not replay.");
    if (observation.receipt && await this.store.has(id, "receipt.json")) {
      const accepted = await this.store.read<{ runId: string }>(id, "receipt.json");
      if (accepted.runId !== observation.receipt.runId) {
        throw new FactoryError("RECEIPT_CONFLICT", "Retained evidence identifies a different Run. Do not replay.");
      }
    }

    // No terminal and no positive non-dispatch observation: leave unresolved.
    if ((!observation.terminal && observation.dispatch !== "not-dispatched") ||
        (observation.dispatch !== "not-dispatched" && observation.cleanup !== "confirmed")) {
      return "unresolved";
    }
    let decision: Decision = {
      taskDigest: transaction.task.digest, disposition: "blocked",
      reason: observation.dispatch === "not-dispatched" ? "Prepared work was not dispatched." : "Execution did not produce a valid review packet.",
    };
    const output = retained.output && !Array.isArray(retained.output) && typeof retained.output === "object"
      ? retained.output as Record<string, unknown> : undefined;
    if (observation.receipt && observation.terminal?.status === "succeeded" &&
        observation.terminal.outcome === "done" && observation.cleanup === "confirmed" &&
        output && !Array.isArray(output) && typeof output === "object" &&
        output.version === 1 && output.taskDigest === transaction.task.digest &&
        (output.disposition === "review" || output.disposition === "blocked") &&
        typeof output.summary === "string" && output.summary.length > 0 &&
        Array.isArray(output.trace)) {
      // This admits the packet for human review, not its correctness or merge.
      decision = { taskDigest: transaction.task.digest, disposition: output.disposition, reason: output.summary };
    }
    const exports = join(this.store.attemptPath(id), "exports");
    await directory(exports, true);
    if (observation.terminal && observation.cleanup === "confirmed" &&
        (observation.retained === "available" || retained.checkpoint?.availability === "available")) {
      const source = observation.retained === "available" ? "final" : "checkpoint";
      const exported = await client.export({
        ticket: transaction.prepared.ticket, destination: join(exports, randomUUID()), source,
      });
      await this.store.event(id, "export", exported);
    }
    // Write the decision before the move; recovery can repeat only the move.
    if (!(await this.store.has(id, "disposition.json"))) await this.store.save(id, "disposition.json", decision);
    else decision = await this.store.read<Decision>(id, "disposition.json");
    return this.applyDisposition(transaction, decision);
  }

  private async applyDisposition(transaction: Transaction, decision: Decision): Promise<string> {
    const latest = (await this.latest()).get(transaction.task.id);
    if (latest?.attemptId !== transaction.attemptId) return "superseded";
    const cards = await observeBoard(this.root);
    const card = cards.find(item => item.id === transaction.task.id);
    if (!card || card.digest !== transaction.task.digest) {
      await this.store.event(transaction.attemptId, "revision-conflict", { reason: card ? "changed" : "missing" });
      return "revision-conflict";
    }
    if (["review", "done"].includes(card.lane) && await this.store.has(transaction.attemptId, "acceptance.json")) {
      const acceptance = await this.store.read<{ taskDigest: string }>(transaction.attemptId, "acceptance.json");
      if (acceptance.taskDigest === card.digest) {
        if (card.lane !== "done") await moveCard(this.root, card, "done");
        return "done";
      }
    }
    if (card.lane === "doing") {
      await moveCard(this.root, card, decision.disposition);
      return decision.disposition;
    }
    if (card.lane === decision.disposition) return decision.disposition;
    await this.store.event(transaction.attemptId, "manual-move", { lane: card.lane });
    return "manual-move";
  }

  async recover(): Promise<{ attemptId: string; disposition: string }[]> {
    return this.store.locked(async () => {
      const result = [];
      for (const transaction of await this.store.transactions()) {
        if (await this.store.has(transaction.attemptId, "disposition.json")) {
          const disposition = await this.applyDisposition(transaction, await this.store.read<Decision>(transaction.attemptId, "disposition.json"));
          if (disposition !== "superseded") result.push({ attemptId: transaction.attemptId, disposition });
          continue;
        }
        const client = this.client(transaction.project);
        // Neither lookup nor result can submit or acquire the lost owner's lifetime.
        await this.store.event(transaction.attemptId, "recovery-observation", await client.lookup({ ticket: transaction.prepared.ticket }));
        result.push({ attemptId: transaction.attemptId, disposition: await this.settle(transaction, client) });
      }
      return result;
    }, true);
  }

  async cancel(cardId: string): Promise<{ acknowledged: boolean; cleanup: string }> {
    const transaction = (await this.latest()).get(cardId);
    if (!transaction) throw new FactoryError("NO_ATTEMPT", "This card has no captured attempt.");
    const result = await this.client(transaction.project).cancel({ ticket: transaction.prepared.ticket });
    return { acknowledged: result.acknowledged, cleanup: result.observation.cleanup ?? "unknown" };
  }

  async accept(cardId: string, note: string): Promise<void> {
    if (!note.trim()) throw new FactoryError("ACCEPTANCE_NOTE_REQUIRED", "Record the human acceptance decision with a nonempty note.");
    await this.store.locked(async () => {
      const card = (await observeBoard(this.root)).find(item => item.id === cardId);
      const transaction = (await this.latest()).get(cardId);
      if (!card || card.lane !== "review" || !transaction ||
          card.digest !== transaction.task.digest || !(await this.store.has(transaction.attemptId, "disposition.json"))) {
        throw new FactoryError("NOT_REVIEWABLE", "Only the unchanged review revision with a retained decision can be accepted.");
      }
      const decision = await this.store.read<Decision>(transaction.attemptId, "disposition.json");
      if (decision.disposition !== "review") throw new FactoryError("NOT_REVIEWABLE", "The attempt did not produce a review-ready packet.");
      if (!(await this.store.has(transaction.attemptId, "acceptance.json"))) {
        await this.store.save(transaction.attemptId, "acceptance.json", { taskDigest: card.digest, note, at: new Date().toISOString() });
      }
      await moveCard(this.root, card, "done");
    });
  }

  async requeue(cardId: string, note: string): Promise<void> {
    if (!note.trim()) throw new FactoryError("REQUEUE_NOTE_REQUIRED", "Record why a new execution is authorized.");
    await this.store.locked(async () => {
      const card = (await observeBoard(this.root)).find(item => item.id === cardId);
      const transaction = (await this.latest()).get(cardId);
      if (!card || !transaction || !(await this.store.has(transaction.attemptId, "disposition.json"))) {
        throw new FactoryError("RECOVERY_REQUIRED", "Reconcile the existing attempt before authorizing new work.");
      }
      if (!(await this.store.has(transaction.attemptId, "requeue.json"))) {
        await this.store.save(transaction.attemptId, "requeue.json", { note, taskDigest: card.digest, at: new Date().toISOString() });
      }
      if (card.lane !== "ready") await moveCard(this.root, card, "ready");
    });
  }
}
