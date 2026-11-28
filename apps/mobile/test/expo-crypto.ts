// Use real UUID generation in Node; suite-local mocks can still control IDs.
export { randomUUID } from "node:crypto";
