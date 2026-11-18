// Numbered, acknowledged delivery between the workbench and the relay: sequence numbers, a replay buffer, duplicate drop and a heartbeat clock.

/** Most frames, and most bytes, kept for replay while the relay has not acknowledged them. */
export const REPLAY_LIMITS = { frames: 256, bytes: 4 * 1024 * 1024 } as const;
/** How long the relay may stay silent before the link counts as lost, in milliseconds. */
export const HEARTBEAT_GRACE_MS = 45_000;

/** One numbered frame travelling to the relay. */
export type NumberedFrame = Readonly<{ seq: number; payload: string }>;
/** What happened to a frame that came from the relay. */
export type Acceptance = 'accepted' | 'duplicate' | 'gap';

/** The state of one link between a session and its relay. */
export function createFrameLink(options: { now: () => number; limits?: { frames: number; bytes: number } }) {
  const limits = options.limits ?? REPLAY_LIMITS;
  const unacknowledged: NumberedFrame[] = [];
  let unacknowledgedBytes = 0;
  let sentSeq = 0;
  let acknowledgedSeq = 0;
  let receivedSeq = 0;
  let heardAt = options.now();

  return {
    /** Numbers a frame for the relay and keeps it until acknowledged. Refuses when the relay is too far behind. */
    send(payload: string): { ok: true; frame: NumberedFrame } | { ok: false; reason: 'replay-full' } {
      const bytes = Buffer.byteLength(payload);
      if (unacknowledged.length >= limits.frames || unacknowledgedBytes + bytes > limits.bytes) return { ok: false, reason: 'replay-full' };
      sentSeq += 1;
      const frame = { seq: sentSeq, payload };
      unacknowledged.push(frame);
      unacknowledgedBytes += bytes;
      return { ok: true, frame };
    },
    /** Forgets every frame up to and including `seq`. A number below the last acknowledgement or above the last sent changes nothing. */
    acknowledge(seq: number): void {
      if (!Number.isInteger(seq) || seq <= acknowledgedSeq || seq > sentSeq) return;
      acknowledgedSeq = seq;
      while (unacknowledged.length > 0 && unacknowledged[0].seq <= seq) unacknowledgedBytes -= Buffer.byteLength(unacknowledged.shift()!.payload);
    },
    /** The frames after `seq`, for a relay that reconnects having seen up to `seq`. */
    replayAfter(seq: number): NumberedFrame[] {
      return unacknowledged.filter(frame => frame.seq > seq);
    },
    /** Takes a frame from the relay. A repeated number is dropped; a skipped number is a gap the caller must treat as an error. */
    accept(seq: number): Acceptance {
      if (!Number.isInteger(seq) || seq < 1) return 'gap';
      if (seq <= receivedSeq) return 'duplicate';
      if (seq !== receivedSeq + 1) return 'gap';
      receivedSeq = seq;
      return 'accepted';
    },
    /** Notes that the relay is alive. Any request from it counts. */
    heard(): void {
      heardAt = options.now();
    },
    /** How long the relay has been silent, in milliseconds. */
    silentFor(): number {
      return options.now() - heardAt;
    },
    lost(): boolean {
      return options.now() - heardAt >= HEARTBEAT_GRACE_MS;
    },
    get lastSent(): number {
      return sentSeq;
    },
    get lastAcknowledged(): number {
      return acknowledgedSeq;
    },
    /** The number of the last frame taken from the relay, which the answer to every relay request confirms. */
    get lastReceived(): number {
      return receivedSeq;
    },
    get pending(): { frames: number; bytes: number } {
      return { frames: unacknowledged.length, bytes: unacknowledgedBytes };
    },
  };
}

export type FrameLink = ReturnType<typeof createFrameLink>;
