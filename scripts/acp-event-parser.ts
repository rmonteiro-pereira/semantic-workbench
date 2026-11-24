// Reads a server-sent event stream into events with a number and one line of data. Comment lines are ignored.

/** One event of the stream. `id` is the number the workbench gave it. */
export type StreamEvent = { id?: number; name?: string; data: string };

/** Yields each complete event of a response body as it arrives. */
export async function* parseEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of body) {
    pending += decoder.decode(chunk, { stream: true });
    let boundary = pending.indexOf('\n\n');
    while (boundary >= 0) {
      const block = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      const event = parseBlock(block);
      if (event) yield event;
      boundary = pending.indexOf('\n\n');
    }
  }
}

function parseBlock(block: string): StreamEvent | undefined {
  let id: number | undefined;
  let name: string | undefined;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('id: ')) id = Number(line.slice(4));
    else if (line.startsWith('event: ')) name = line.slice(7);
    else if (line.startsWith('data: ')) data.push(line.slice(6));
  }
  return data.length === 0 ? undefined : { id, name, data: data.join('\n') };
}

/** Yields each line the agent writes, whatever size the chunks arrive in. A last line without a line break is yielded when the stream ends. */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of body) {
    pending += decoder.decode(chunk, { stream: true });
    let newline = pending.indexOf('\n');
    while (newline >= 0) {
      yield pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      newline = pending.indexOf('\n');
    }
  }
  if (pending.length > 0) yield pending;
}
