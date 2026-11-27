export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { getServices } = await import("./server/services");
      await getServices();
    } catch (error) {
      console.error("Warmup skipped during instrumentation:", error);
    }
  }
}
