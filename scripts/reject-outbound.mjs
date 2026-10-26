globalThis.fetch = async () => {
  throw new Error("Fixture verification blocked outbound request");
};
