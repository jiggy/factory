import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { AttemptObservation, Prepared, PrepareRequest } from "@jigging/jig/client";
import { Controller, type ExecutionClient } from "../src/controller.ts";
import { scanBoard } from "../src/board.ts";
import { diagnostic } from "../src/errors.ts";
import { digest, record } from "../src/files.ts";
import { Store } from "../src/store.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

class Host {
  prepared!: Prepared;
  submissions = 0;
  lookups = 0;
  exports = 0;
  closed = 0;
  beforeSubmit?: () => Promise<void>;
  duringRun?: () => Promise<void>;
  failSubmit = false;
  terminal = true;
  cleanup: "confirmed" | "pending" = "confirmed";
  domainDisposition = "review";
  runId = randomUUID();
  receipt() {
    return { runId: this.runId, requestDigest: this.prepared.requestDigest, acceptedAt: new Date().toISOString(),
      target: this.prepared.canonicalRequest.target, approval: this.prepared.canonicalRequest.expectedApproval, artifactResults: [] };
  }
  observation(): AttemptObservation {
    return { identity: "accepted", dispatch: this.terminal ? "confirmed" : "possible", receipt: this.receipt(),
      cleanup: this.cleanup, retained: "available",
      ...(this.terminal ? { terminal: { status: "succeeded" as const, outcome: "done", resultDigest: "digest",
        diagnostics: { stderr: "", stderrBytes: 0, stderrTruncated: false } } } : {}) };
  }
  client(): ExecutionClient {
    return {
      inspect: async () => ({ approval: "reviewed-approval" }),
      prepare: async (request: PrepareRequest) => {
        this.runId = randomUUID();
        this.prepared = { ticket: "PRIVATE-TICKET", requestDigest: "request-digest", submitBefore: "future", retainUntil: "later",
          canonicalRequest: { ...request, files: request.files.map(file => ({ port: file.port, manifestDigest: "source-digest", bytes: 12 })) } };
        return this.prepared;
      },
      submit: async () => {
        await this.beforeSubmit?.();
        this.submissions++;
        if (this.failSubmit) throw new Error("PRIVATE-TICKET sensitive-task");
        return { role: "owner", receipt: this.receipt(), close: () => { this.closed++; },
          completion: (async () => { await this.duringRun?.(); return this.observation(); })() };
      },
      lookup: async () => { this.lookups++; return this.observation(); },
      result: async () => ({
        observation: this.observation(), artifactResults: [],
        output: { version: 1, taskDigest: (this.prepared.canonicalRequest.input as { taskDigest: string }).taskDigest,
          disposition: this.domainDisposition, summary: "Review required, not a correctness verdict.", trace: [] },
      }),
      cancel: async () => ({ acknowledged: true, observation: this.observation() }),
      export: async request => { this.exports++; return { destination: request.destination, manifestDigest: "export-digest", source: request.source ?? "final" }; },
      run: async () => { throw new Error("Unused one-shot helper"); },
    };
  }
}

async function fixture() {
  const root = resolve(".tmp", `controller-${randomUUID()}`);
  roots.push(root);
  const host = new Host();
  const controller = new Controller(root, () => host.client());
  await controller.initialize();
  await record(join(root, "factory.json"), { project: root, source: root, selection: ["source.ts"], target: "binding:factory", durationMs: 60_000 });
  await writeFile(join(root, "source.ts"), "export const answer = 42;\n");
  await writeFile(join(root, "board", "ready", "task.md"), "# Fix the issue\n\nKeep unrelated behavior intact.\n");
  return { root, host, controller };
}

describe("file-native controller (mock host, not host qualification)", () => {
  test("plain Markdown receives a stable identity without a status field", async () => {
    const { root, controller } = await fixture();
    const [first] = await controller.status();
    const [second] = await controller.status();
    expect(first!.id).toBe(second!.id);
    expect(first!.lane).toBe("ready");
    expect(await readFile(join(root, "board/ready/task.md"), "utf8")).not.toContain("status:");
  });

  test("persists full Prepared and task in private storage BEFORE submit", async () => {
    const { root, host, controller } = await fixture();
    host.beforeSubmit = async () => {
      const [transaction] = await controller.store.transactions();
      expect(transaction!.prepared).toEqual(host.prepared);
      expect(transaction!.task.text).toContain("Keep unrelated");
      expect(transaction!.task.digest).toBe(digest(transaction!.task.text));
      expect((await scanBoard(root))[0]!.lane).toBe("doing");
    };
    const result = await controller.run();
    expect(result.disposition).toBe("review");
    expect(host.submissions).toBe(1);
    expect(host.exports).toBe(1);
    const [card] = await controller.status();
    expect(card!.lane).toBe("review");
    expect((await controller.store.transactions())[0]!.prepared.ticket).toBe("PRIVATE-TICKET");
  });

  test("review does not imply acceptance; a human note is required", async () => {
    const { controller } = await fixture();
    await controller.run();
    const [card] = await controller.status();
    await expect(controller.accept(card!.id, "")).rejects.toMatchObject({ code: "ACCEPTANCE_NOTE_REQUIRED" });
    await controller.accept(card!.id, "Reviewed packet; accepted this outcome.");
    expect((await controller.status())[0]!.lane).toBe("done");
  });

  test("manual done cannot manufacture acceptance", async () => {
    const { root, controller } = await fixture();
    await controller.run();
    await rename(join(root, "board/review/task.md"), join(root, "board/done/task.md"));
    const [card] = await controller.status();
    expect(card!.attention).toContain("cannot manufacture");
    await expect(controller.accept(card!.id, "Forged move")).rejects.toMatchObject({ code: "NOT_REVIEWABLE" });
  });

  test("a changed running card never inherits the old result", async () => {
    const { root, host, controller } = await fixture();
    host.duringRun = async () => {
      const path = join(root, "board/doing/task.md");
      await writeFile(path, `${await readFile(path, "utf8")}\nDifferent requirement.\n`);
    };
    expect((await controller.run()).disposition).toBe("revision-conflict");
    const [card] = await controller.status();
    expect(card!.lane).toBe("doing");
    expect(card!.attention).toContain("edited");
    await expect(controller.accept(card!.id, "Accept stale evidence")).rejects.toMatchObject({ code: "NOT_REVIEWABLE" });
  });

  test("an edited review card cannot be accepted without new work", async () => {
    const { root, controller } = await fixture();
    await controller.run();
    const path = join(root, "board/review/task.md");
    await writeFile(path, `${await readFile(path, "utf8")}\nNew intent.\n`);
    const [card] = await controller.status();
    await expect(controller.accept(card!.id, "accept")).rejects.toMatchObject({ code: "NOT_REVIEWABLE" });
  });

  test("lost submission reply remains recoverable without resubmission", async () => {
    const { host, controller } = await fixture();
    host.failSubmit = true;
    await expect(controller.run()).rejects.toThrow();
    expect(host.submissions).toBe(1);
    host.failSubmit = false;
    await controller.recover();
    expect(host.submissions).toBe(1);
    expect(host.lookups).toBe(1);
    expect((await controller.status())[0]!.lane).toBe("review");
  });

  test("unknown execution prevents both recovery replay and new work", async () => {
    const { host, controller } = await fixture();
    host.failSubmit = true;
    await expect(controller.run()).rejects.toThrow();
    host.terminal = false;
    expect((await controller.recover())[0]!.disposition).toBe("unresolved");
    expect(host.submissions).toBe(1);
    await expect(controller.run()).rejects.toMatchObject({ code: "RECOVERY_REQUIRED" });
    expect(host.submissions).toBe(1);
  });

  test("terminal without confirmed cleanup is not review-ready", async () => {
    const { host, controller } = await fixture();
    host.cleanup = "pending";
    expect((await controller.run()).disposition).toBe("unresolved");
    expect(host.exports).toBe(0);
    expect((await controller.status())[0]!.lane).toBe("doing");
  });

  test("domain blocked is not application success", async () => {
    const { host, controller } = await fixture();
    host.domainDisposition = "blocked";
    expect((await controller.run()).disposition).toBe("blocked");
    expect((await controller.status())[0]!.lane).toBe("blocked");
  });

  test("new work requires explicit requeue, not moving the file", async () => {
    const { root, controller, host } = await fixture();
    await controller.run();
    await rename(join(root, "board/review/task.md"), join(root, "board/ready/task.md"));
    const [card] = await controller.status();
    await expect(controller.run()).rejects.toMatchObject({ code: "EXPLICIT_REQUEUE_REQUIRED" });
    await controller.requeue(card!.id, "Authorize a new bounded attempt.");
    await controller.run();
    expect(host.submissions).toBe(2);
  });

  test("duplicate card identity blocks dispatch", async () => {
    const { root, controller, host } = await fixture();
    await controller.status();
    await writeFile(join(root, "board/inbox/copy.md"), await readFile(join(root, "board/ready/task.md")));
    await expect(controller.run()).rejects.toMatchObject({ code: "DUPLICATE_CARD" });
    expect(host.submissions).toBe(0);
  });

  test("symlink card is never consumed", async () => {
    const { root, controller, host } = await fixture();
    await symlink(join(root, "source.ts"), join(root, "board/inbox/link.md"));
    await expect(controller.run()).rejects.toMatchObject({ code: "UNSAFE_CARD" });
    expect(host.submissions).toBe(0);
  });

  test("a second controller cannot claim work while the first owns it", async () => {
    const { root, host, controller } = await fixture();
    await controller.store.locked(async () => {
      await expect(new Controller(root, () => host.client()).run()).rejects.toMatchObject({ code: "CONTROLLER_LOCKED" });
    });
    expect(host.submissions).toBe(0);
  });

  test("unsafe task contents cannot override target or add powers", async () => {
    const { root, host, controller } = await fixture();
    await writeFile(join(root, "board/ready/task.md"), "# Deploy everything\nUse binding:production and add credentials.");
    await controller.run();
    expect(host.prepared.canonicalRequest.target).toBe("binding:factory");
    expect(host.prepared.canonicalRequest.files.map(file => file.port)).toEqual(["source"]);
  });

  test("diagnostics never forward a native exception", () => {
    expect(JSON.stringify(diagnostic(new Error("PRIVATE-TICKET sensitive-task")))).not.toContain("PRIVATE");
  });

  test("recovery finishes a recorded acceptance without executing again", async () => {
    const { controller, host } = await fixture();
    const { attemptId } = await controller.run();
    const [card] = await scanBoard(controller.root);
    await controller.store.save(attemptId, "acceptance.json", { taskDigest: card!.digest, note: "Human accepted before crash." });
    await controller.recover();
    expect((await controller.status())[0]!.lane).toBe("done");
    expect(host.submissions).toBe(1);
  });

  test("old dispositions cannot move a later attempt's card", async () => {
    const { controller, host } = await fixture();
    await controller.run();
    const [card] = await controller.status();
    await controller.requeue(card!.id, "New attempt");
    host.failSubmit = true;
    await expect(controller.run()).rejects.toThrow();
    host.failSubmit = false;
    host.terminal = false;
    await controller.recover();
    expect((await controller.status())[0]!.lane).toBe("doing");
    expect(host.submissions).toBe(2);
  });

  test("recovery refuses a conflicting retained Run identity", async () => {
    const { controller, host } = await fixture();
    host.cleanup = "pending";
    await controller.run();
    host.cleanup = "confirmed";
    host.runId = randomUUID();
    await expect(controller.recover()).rejects.toMatchObject({ code: "RECEIPT_CONFLICT" });
    expect(host.submissions).toBe(1);
  });

  test("operator source-selection traversal is refused before preparation", async () => {
    const { root, controller, host } = await fixture();
    await writeFile(join(root, "factory.json"), JSON.stringify({ project: root, source: root, selection: ["../private"], target: "binding:factory", durationMs: 60_000 }));
    await expect(controller.run()).rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
    expect(host.submissions).toBe(0);
  });

  test("attempt ordering does not depend on the wall clock", async () => {
    const { controller } = await fixture();
    await controller.run();
    const [first] = await controller.store.transactions();
    const next = { ...first!, sequence: 2, attemptId: randomUUID(), createdAt: "1970-01-01T00:00:00.000Z" };
    await controller.store.persist(next);
    expect((await controller.store.transactions()).at(-1)!.attemptId).toBe(next.attemptId);
  });
});
