const WEBHOOK_URL = "https://n8n.julianschwab.dev/webhook/chat";

/**
 * Send a prompt to the n8n webhook and stream the response token by token.
 *
 * @param {string} prompt - The user prompt to send.
 * @param {object} [options] - Optional settings.
 * @param {string} [options.systemPrompt] - System prompt / level instructions.
 * @param {(token: string) => void} [options.onToken] - Called for each streamed token.
 * @param {() => void} [options.onStart] - Called when the stream begins.
 * @param {() => void} [options.onEnd] - Called when the stream ends.
 * @param {(error: Error) => void} [options.onError] - Called on error.
 * @returns {Promise<string>} The full assembled response text.
 */
export async function streamChat(prompt, options = {}) {
  const { systemPrompt, onToken, onStart, onEnd, onError } = options;

  const body = { prompt };
  if (systemPrompt) {
    body.systemPrompt = systemPrompt;
  }

  let fullText = "";

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Each JSON object is on its own line
      const lines = buffer.split("\n");
      // Keep the last (possibly incomplete) chunk in the buffer
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);

          if (event.type === "begin") {
            onStart?.();
          } else if (event.type === "item" && event.content != null) {
            fullText += event.content;
            onToken?.(event.content);
          } else if (event.type === "end") {
            onEnd?.();
          }
        } catch {
          // Ignore malformed lines
        }
      }
    }

    // Process any remaining data in the buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim());
        if (event.type === "item" && event.content != null) {
          fullText += event.content;
          onToken?.(event.content);
        } else if (event.type === "end") {
          onEnd?.();
        }
      } catch {
        // Ignore
      }
    }
  } catch (err) {
    onError?.(err);
    throw err;
  }

  return fullText;
}
