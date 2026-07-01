import { task } from "@trigger.dev/sdk";

export const helloWorld = task({
  id: "hello-world",
  maxDuration: 60,
  run: async (payload: { message: string }) => {
    console.log(`Hello from Trigger.dev: ${payload.message}`);
    return { success: true, echoed: payload.message };
  },
});
