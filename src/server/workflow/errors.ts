export class RunAbortedError extends Error { constructor(){super("Workflow interrupted by reset");this.name="RunAbortedError";} }
