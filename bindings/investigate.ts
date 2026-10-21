import { defineBinding } from "@jigging/jig";

export default defineBinding({
  package: "./flows/investigate",
  slots: { agent: "binding:agent" },
});
