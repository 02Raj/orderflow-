let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) {
    sharedCtx = new Ctx();
  }
  if (sharedCtx.state === "suspended") {
    void sharedCtx.resume();
  }
  return sharedCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType = "sine",
) {
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** Plays a crisp two-note chime for newly arrived kitchen tickets. */
export function playNewOrderSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 880, 0, 0.14, 0.12, "triangle");
  playTone(ctx, 1174.66, 0.12, 0.22, 0.14, "triangle");
}

/** Plays a bright classic service-pass bell ("ding!") when food is ready or served. */
export function playReadyBellSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 1567.98, 0, 0.55, 0.14, "sine");
  playTone(ctx, 3135.96, 0, 0.35, 0.05, "sine");
}

/** Plays a subtle urgent double-beep for tickets waiting past the ack threshold. */
export function playUrgentAlertSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 660, 0, 0.1, 0.1, "square");
  playTone(ctx, 660, 0.14, 0.1, 0.1, "square");
}
