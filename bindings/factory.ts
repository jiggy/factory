import { defineBinding } from "@jigging/jig";

export default defineBinding({
  package: "./flows/conductor",
  settings: {
    maxSteps: 6,
    techniques: [
      { id: "investigate", description: "Investigate the current candidate and return findings without changing it.", effect: "observe" },
      { id: "revise", description: "Propose source revisions in a fresh candidate snapshot using task intent and current evidence.", effect: "candidate" },
      { id: "evaluate", description: "Compile and test this candidate using the reviewed Bun/TypeScript recipe. Results are execution evidence, not independent acceptance.", effect: "evaluation" },
    ],
  },
  slots: {
    agent: "binding:agent",
    investigate: { target: "binding:investigate", attachments: { candidate: { supplied: "read" } } },
    revise: { target: "binding:revise", attachments: { candidate: { supplied: "read" }, deliverables: { create: true } } },
    evaluate: {
      kind: "evaluation",
      recipe: "./recipes/typescript",
      attachments: { candidate: "supplied-read", deliverables: "operation-create" },
    },
  },
});
