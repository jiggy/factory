import { defineBinding } from "@jigging/jig";

// Operator choice. Review any client/model change; authenticate outside this repo.
export default defineBinding({
  package: "npm:@jigging/agent-acp",
  slots: { native: { kind: "acp", client: "codex" } },
});
