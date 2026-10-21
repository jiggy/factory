import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { OperationError, type Artifact, type FlowCall, type RunContext, type CallResult, type JsonValue } from "@jigging/flow";
import { action, conduct, techniques } from "../flows/conductor/conduct.ts";
import { revise, safeCandidatePath } from "../flows/revise/revise.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const held = (name: string) => ({ reference: name } as Artifact);
const settings = {
  maxSteps: 6,
  techniques: [
    { id: "inspect", description: "Investigate", effect: "observe" },
    { id: "edit", description: "Revise", effect: "candidate" },
    { id: "check", description: "Evaluate", effect: "evaluation" },
  ],
};
const decision = (kind: string, technique = "", instruction = "") => ({
  outcome: "done", output: { structured: { kind, technique, instruction, reason: "Address the remaining uncertainty." }, text: "" },
});

async function context(call: (request: FlowCall) => Promise<CallResult>) {
  const root = resolve(".tmp", `flow-${randomUUID()}`);
  roots.push(root);
  await mkdir(join(root, "out"), { recursive: true });
  await mkdir(join(root, "source"));
  await writeFile(join(root, "source/main.ts"), "export const n = 1;\n");
  const run = {
    input: { version: 1, task: "Resolve this issue.", taskDigest: "snapshot" },
    settings,
    attachments: { source: { path: join(root, "source"), access: "read", artifact: held("source") },
      candidate: { path: join(root, "source"), access: "read", artifact: held("source") },
      deliverables: { path: join(root, "out"), access: "read-write" } },
    call, release: async () => {}, signal: new AbortController().signal,
    scratch: root, deadlineUnixMs: Date.now() + 60_000, channels: {},
  } as unknown as RunContext;
  return { run, root };
}

test("agent can start with evaluation then revise then finish, with no mandatory pipeline", async () => {
  const calls: string[] = [];
  const choices = [decision("technique", "check", "Find current failure"), decision("technique", "edit", "Use the failing evidence"), decision("finish")];
  const { run } = await context(async request => {
    calls.push(request.slot);
    if (request.slot === "agent") return choices.shift()! as CallResult;
    if (request.slot === "check") return { outcome: "done", output: { testExit: 1 }, artifacts: { deliverables: held("report") } };
    if (request.slot === "edit") return { outcome: "done", output: { changed: ["main.ts"] }, artifacts: { deliverables: held("revised") } };
    return { outcome: "done", output: {} };
  });
  const result = await conduct(run);
  expect(calls.filter(slot => !["agent", "checkpoint"].includes(slot))).toEqual(["check", "edit"]);
  expect(result.artifactResults!.candidate!.reference).toBe("revised");
  expect((result.output as { disposition: string }).disposition).toBe("review");
});

test("an agent may ask without executing any technique", async () => {
  const calls: string[] = [];
  const { run } = await context(async request => { calls.push(request.slot); return decision("ask") as CallResult; });
  expect((await conduct(run)).output).toMatchObject({ disposition: "blocked" });
  expect(calls).toEqual(["agent"]);
});

test("a fabricated target never reaches dispatch", async () => {
  const calls: string[] = [];
  const { run } = await context(async request => { calls.push(request.slot); return decision("technique", "deploy") as CallResult; });
  await expect(conduct(run)).rejects.toThrow("outside the reviewed set");
  expect(calls).toEqual(["agent"]);
});

test("repeating a technique with unchanged candidate and instruction stops", async () => {
  let checks = 0;
  const { run } = await context(async request => {
    if (request.slot === "agent") return decision("technique", "check", "same check") as CallResult;
    if (request.slot === "check") checks++;
    return { outcome: "done", output: {} };
  });
  expect((await conduct(run)).output).toMatchObject({ disposition: "blocked" });
  expect(checks).toBe(1);
});

test("uncertain child failure stops rather than trying another effect", async () => {
  let calls = 0;
  const { run } = await context(async request => {
    if (request.slot === "agent") return decision("technique", "edit") as CallResult;
    calls++;
    throw new OperationError("UNCERTAIN");
  });
  expect((await conduct(run)).output).toMatchObject({ disposition: "blocked" });
  expect(calls).toBe(1);
});

test("technique budget bounds actions even when the agent changes instructions", async () => {
  let choices = 0;
  const { run } = await context(async request => request.slot === "agent"
    ? decision("technique", "inspect", `Investigation ${++choices}`) as CallResult
    : { outcome: "done", output: {} });
  expect((await conduct(run)).output).toMatchObject({ disposition: "blocked" });
  expect(choices).toBe(6);
});

test("duplicate or reserved technique identities fail configuration", () => {
  expect(() => techniques({ ...settings, techniques: [{ id: "agent", description: "steal authority", effect: "observe" }] })).toThrow();
  expect(() => action({ kind: "finish", technique: "", instruction: "", reason: "" }, techniques(settings))).toThrow();
});

test.each(["../escape.ts", "/absolute", "a//b", "a/./b", "a\\b", ".git/config", "node_modules/a", "a/\u0000b"])("candidate path %s is rejected", path => {
  expect(safeCandidatePath(path)).toBe(false);
});

test("revision produces fresh files and leaves original candidate unchanged", async () => {
  const { run, root } = await context(async () => ({ outcome: "done", output: { structured: {
    summary: "Changed n", files: [{ path: "main.ts", text: "export const n = 2;\n" }],
  } } }));
  expect((await revise(run)).outcome).toBe("done");
  expect(await readFile(join(root, "source/main.ts"), "utf8")).toContain("n = 1");
  expect(await readFile(join(root, "out/main.ts"), "utf8")).toContain("n = 2");
});

test("candidate traversal is rejected before writing any proposed output", async () => {
  const { run } = await context(async () => ({ outcome: "done", output: { structured: {
    summary: "Escape", files: [{ path: "../controller.ts", text: "unsafe" }],
  } } }));
  await expect(revise(run)).rejects.toThrow("Unsafe");
});
