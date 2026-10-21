import { AttemptClientError } from "@jigging/jig/client";

export class FactoryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "FactoryError";
  }
}

/** Never relay native errors: they may contain input, tickets or private paths. */
export function diagnostic(error: unknown): { code: string; message: string } {
  if (error instanceof AttemptClientError) {
    return {
      code: error.code,
      message: `${error.operation} failed. ${error.uncertain
        ? "Execution may be uncertain; use recover, never an automatic retry."
        : "Inspect project approval, capacity and host prerequisites before new work."}`,
    };
  }
  return error instanceof FactoryError
    ? { code: error.code, message: error.message }
    : { code: "FACTORY_OPERATION_FAILED", message: "Operation failed. Inspect protected attempt evidence; do not retry uncertain work." };
}
