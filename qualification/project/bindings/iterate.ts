import { defineBinding } from '@jigging/jig'
export default defineBinding({
  package: './flows/iterate',
  slots: {
    produce: { target: 'flow:flows/produce', attachments: { deliverables: { create: true } } },
    evaluate: {
      kind: 'evaluation',
      recipe: './recipe',
      attachments: { candidate: 'supplied-read', deliverables: 'operation-create' },
    },
  },
})
