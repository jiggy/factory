import { expect, test } from "bun:test";
import { qualificationCode } from "../qualification/diagnostics.ts";

test("qualification retains the public evaluator-launch failure code", () => {
  expect(qualificationCode({ stderr: "No Flow was started.\nDiagnostic code: PROJECT_EVALUATOR_LAUNCH\n" })).toBe("PROJECT_EVALUATOR_LAUNCH");
});

test("qualification diagnostics do not forward arbitrary subprocess text", () => {
  const error = { stderr: "PRIVATE-TICKET source-content\nDiagnostic code: SECRET_VALUE\n" };
  expect(qualificationCode(error)).toBe("QUALIFICATION_FAILED");
  expect(qualificationCode(new Error("PRIVATE-TICKET"))).toBe("QUALIFICATION_FAILED");
});
