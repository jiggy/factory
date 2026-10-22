import { expect, test } from "bun:test";
import { diagnoseBoard, latestByTask, planIntake, type AttemptFacts } from "../src/analysis.ts";
import type { ObservedCard } from "../src/board.ts";

const card = (changes: Partial<ObservedCard> = {}): ObservedCard => ({
  id: "task-1", name: "task.md", lane: "review", text: "Do useful work", digest: "revision-1", ...changes,
});
const attempt = (changes: Partial<AttemptFacts> = {}): AttemptFacts => ({
  sequence: 1, attemptId: "attempt-1", task: { id: "task-1", name: "task.md", digest: "revision-1" },
  decision: { taskDigest: "revision-1", disposition: "review" }, requeued: false, ...changes,
});

test("diagnosis is deterministic and does not mutate captured inputs", () => {
  const cards = Object.freeze([Object.freeze(card())]);
  const facts = Object.freeze([Object.freeze(attempt())]);
  expect(diagnoseBoard(cards, facts)).toEqual(diagnoseBoard(cards, facts));
  expect(diagnoseBoard(cards, facts)).toEqual([{ id: "task-1", name: "task.md", lane: "review" }]);
  expect(cards[0]!.lane).toBe("review");
});

test("latest-attempt analysis is independent of input order", () => {
  const first = attempt();
  const second = attempt({ sequence: 2, attemptId: "attempt-2" });
  expect(latestByTask([second, first]).get("task-1")!.attemptId).toBe("attempt-2");
});

test("new cards are observations, not invented persistent identities", () => {
  const raw = card({ id: null, lane: "inbox" });
  expect(diagnoseBoard([raw], [])[0]).toMatchObject({ id: null, lane: "inbox", attention: expect.stringContaining("reconcile") });
  expect(planIntake([raw])).toEqual([raw]);
  expect(raw.id).toBeNull();
});

test("intake planning rejects empty or already-advanced unidentified cards", () => {
  expect(() => planIntake([card({ id: null, lane: "ready", text: "" })])).toThrow("Write task intent");
  expect(() => planIntake([card({ id: null, lane: "done" })])).toThrow("intake reconciliation");
});

test("a stored acceptance for another revision cannot validate done", () => {
  const [row] = diagnoseBoard([card({ lane: "done" })], [attempt({ acceptedDigest: "different-revision" })]);
  expect(row!.attention).toContain("cannot manufacture");
});

test("unsettled work distinguishes a live controller from recovery", () => {
  const facts: AttemptFacts = { sequence: 1, attemptId: "attempt-1", task: attempt().task, requeued: false };
  expect(diagnoseBoard([card({ lane: "doing" })], [facts], true)[0]!.attention).toContain("Controller owns");
  expect(diagnoseBoard([card({ lane: "doing" })], [facts], false)[0]!.attention).toContain("recovery");
});

test("missing cards retain an explicit diagnostic without reconstructing the board", () => {
  expect(diagnoseBoard([], [attempt()])[0]).toMatchObject({ id: "task-1", lane: "missing", attention: expect.stringContaining("retained") });
});

test("explicitly requeued work is not misreported as awaiting requeue", () => {
  expect(diagnoseBoard([card({ lane: "ready" })], [attempt({ requeued: true })])[0]!.attention).toBeUndefined();
});

test("requeue diagnosis retains attention for a changed task revision", () => {
  const [row] = diagnoseBoard([card({ lane: "ready", digest: "revision-2" })], [attempt({ requeued: true })]);
  expect(row!.attention).toContain("Card edited since execution");
});

test("requeue diagnosis retains attention for a mismatched decision revision", () => {
  const [row] = diagnoseBoard([card({ lane: "ready" })], [attempt({
    requeued: true, decision: { taskDigest: "different-revision", disposition: "review" },
  })]);
  expect(row!.attention).toContain("Recorded decision does not match");
});
