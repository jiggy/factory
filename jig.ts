import { defineJig, discover } from '@jigging/jig'

export default defineJig({
  flows: discover('./flows'),
  bindings: discover('./bindings'),
  entrypoint: 'binding:factory',
})
