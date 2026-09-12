// why: Mongoose does not infer schema.methods on default Model<> types without a custom Methods generic.
export function callToApi<T>(doc: unknown): T {
  return (doc as { toApi: () => T }).toApi();
}
