import { handle } from "@jigging/flow";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

await handle(async run => {
  const output = run.attachments.deliverables!.path;
  const value = (run.input as { value: number }).value;
  await mkdir(join(output, "src"));
  await mkdir(join(output, "test"));
  await writeFile(join(output, "src/main.ts"), `export const answer = ${value};\n`);
  await writeFile(join(output, "test/project.test.ts"), 'import {test, expect} from "bun:test";\nimport {answer} from "../src/main";\ntest("answer", () => expect(answer).toBe(42));\n');
  return { outcome: "done", output: { value } };
});
