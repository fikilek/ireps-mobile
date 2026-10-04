// The visit is already durable before this wait starts. A slow attempt continues
// under the queue's single-flight lock; its eventual acknowledgement updates the queue.
export async function waitForNoAccessSend(attempt, milliseconds = 15000) {
  let timer;
  try {
    return await Promise.race([
      attempt,
      new Promise((resolve) => { timer = setTimeout(() => resolve({ code: "SEND_PENDING" }), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
