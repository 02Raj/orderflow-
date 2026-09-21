export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getServices } = await import("./server/services");
    await getServices();
  }
}
