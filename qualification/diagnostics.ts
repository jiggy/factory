import { AttemptClientError } from "@jigging/jig/client";
import { FactoryError } from "../src/errors.ts";

const reviewCodes = [
  "SANDBOX_UNAVAILABLE", "JIG_COMMAND_UNAVAILABLE", "INTERNAL",
  "PACKAGE_HARDLINK", "PACKAGE_BUN_NODE_MODULES", "PACKAGE_BUN_LOCK_STALE",
  "PROJECT_EVALUATOR_LAUNCH",
] as const;

/** Only known safe public codes escape a failed subprocess, never its raw text. */
export function qualificationCode(error: unknown): string {
  if (error instanceof AttemptClientError || error instanceof FactoryError) return error.code;
  const stderr = error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
    ? error.stderr : "";
  return reviewCodes.find(code => stderr.includes(`Diagnostic code: ${code}\n`)) ?? "QUALIFICATION_FAILED";
}
