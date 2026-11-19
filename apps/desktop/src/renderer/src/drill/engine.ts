// Silnik ćwiczeń: metronom w Web Audio i tapnięcia z klawiatury, wszystko w jednym zegarze.
//
// - Dźwięki planujemy z wyprzedzeniem (co 25 ms na najbliższe 150 ms) dokładnie w czasie AudioContext,
//   zamiast odpalać je setInterval – tempo nie pływa, nawet gdy interfejs ma chwilę opóźnienia.
// - Czas tapnięcia bierzemy z event.timeStamp i przeliczamy na zegar audio przez getOutputTimestamp(),
//   które uwzględnia opóźnienie wyjścia dźwięku. Resztę (słuchawki, sterownik) koryguje kalibracja.

import type { DrillNote, DrillTap, Finger } from '@osu-trainer/analyzer';

export type ClickMode = 'beats' | 'notes' | 'off';

export interface SessionOptions {
  notes: DrillNote[];
  /** tempo uderzeń metronomu (ćwierćnuty); przy 'notes' nieużywane */
  bpm: number;
  clickMode: ClickMode;
  volume: number;
  /** z kalibracji: dodatnie = dźwięk dochodzi później, więc tapnięcia przesuwamy wcześniej */
  offsetMs: number;
  keyK1: string;
  keyK2: string;
  /** odliczanie przed startem (liczba uderzeń) */
  countInBeats?: number;
  onTap?: (tap: DrillTap) => void;
  onEnd?: (taps: DrillTap[], finished: boolean) => void;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.15;

function makeClick(ctx: AudioContext, freq: number, length = 0.035, noise = false): AudioBuffer {
  const rate = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(rate * length), rate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const env = Math.exp(-t * 90);
    data[i] = (noise ? Math.random() * 2 - 1 : Math.sin(2 * Math.PI * freq * t)) * env;
  }
  return buf;
}

export class DrillSession {
  readonly ctx: AudioContext;
  private readonly opts: SessionOptions;
  private readonly gain: GainNode;
  private readonly sounds: { accent: AudioBuffer; beat: AudioBuffer; tick: AudioBuffer };
  /** czas (s, zegar audio) nuty o czasie 0 */
  private startAt = 0;
  private timer: number | null = null;
  private nextBeat = 0;
  private nextNote = 0;
  private endMs: number;
  readonly taps: DrillTap[] = [];
  private stopped = false;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor(opts: SessionOptions) {
    this.opts = opts;
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = Math.max(0, Math.min(1, opts.volume));
    this.gain.connect(this.ctx.destination);
    this.sounds = {
      accent: makeClick(this.ctx, 1650),
      beat: makeClick(this.ctx, 1050),
      tick: makeClick(this.ctx, 0, 0.012, true)
    };
    const last = opts.notes[opts.notes.length - 1];
    this.endMs = (last?.time ?? 0) + 1200;
  }

  get beatMs(): number {
    return 60000 / this.opts.bpm;
  }

  async start(): Promise<void> {
    await this.ctx.resume();
    const countIn = (this.opts.countInBeats ?? 4) * this.beatMs;
    this.startAt = this.ctx.currentTime + 0.25 + countIn / 1000;
    this.nextBeat = -(this.opts.countInBeats ?? 4);
    this.nextNote = 0;
    window.addEventListener('keydown', this.onKey, true);
    this.timer = window.setInterval(() => this.schedule(), LOOKAHEAD_MS);
    this.schedule();
  }

  /** Czas w ms ćwiczenia (0 = pierwsza nuta) dla znacznika czasu zdarzenia (performance.now()). */
  toDrillMs(perfMs: number): number {
    const ts = this.ctx.getOutputTimestamp?.();
    let ctxTime: number;
    if (ts && ts.performanceTime && ts.contextTime !== undefined) {
      ctxTime = ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    } else {
      const latency = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? this.ctx.baseLatency ?? 0;
      ctxTime = this.ctx.currentTime - latency + (perfMs - performance.now()) / 1000;
    }
    return (ctxTime - this.startAt) * 1000 - this.opts.offsetMs;
  }

  /** Bieżący czas ćwiczenia – do rysowania toru. */
  nowMs(): number {
    return this.toDrillMs(performance.now());
  }

  private play(buf: AudioBuffer, atS: number, gain = 1): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (gain !== 1) {
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.gain);
    } else src.connect(this.gain);
    src.start(Math.max(atS, this.ctx.currentTime));
  }

  private schedule(): void {
    if (this.stopped) return;
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD_S;
    const notes = this.opts.notes;

    // odliczanie zawsze na uderzeniach; po nim metronom tylko w trybie „uderzenia”
    const lastBeatMs = this.opts.clickMode === 'beats' ? this.endMs - 1200 : -1;
    for (;;) {
      const beatMs = this.nextBeat * this.beatMs;
      const at = this.startAt + beatMs / 1000;
      if (at > horizon) break;
      const inCountIn = this.nextBeat < 0;
      if (!inCountIn && beatMs > lastBeatMs) break;
      this.play(this.nextBeat % 4 === 0 ? this.sounds.accent : this.sounds.beat, at, inCountIn ? 0.8 : 1);
      this.nextBeat++;
    }
    if (this.opts.clickMode === 'notes') {
      while (this.nextNote < notes.length) {
        const n = notes[this.nextNote]!;
        const at = this.startAt + n.time / 1000;
        if (at > horizon) break;
        this.play(n.accent ? this.sounds.beat : this.sounds.tick, at, n.accent ? 0.9 : 0.6);
        this.nextNote++;
      }
    }

    if (this.nowMs() > this.endMs) this.stop(true);
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    let finger: Finger | null = null;
    if (e.code === this.opts.keyK1) finger = 'K1';
    else if (e.code === this.opts.keyK2) finger = 'K2';
    if (!finger) {
      if (e.code === 'Escape') this.stop(false);
      return;
    }
    e.preventDefault();
    const tap = { time: this.toDrillMs(e.timeStamp), finger };
    this.taps.push(tap);
    this.opts.onTap?.(tap);
  }

  stop(finished: boolean): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) window.clearInterval(this.timer);
    window.removeEventListener('keydown', this.onKey, true);
    // krótko poczekaj, żeby ostatni dźwięk nie urwał się w pół
    setTimeout(() => void this.ctx.close().catch(() => undefined), 300);
    this.opts.onEnd?.(this.taps, finished);
  }

  get isStopped(): boolean {
    return this.stopped;
  }
}

/** Czytelna nazwa klawisza z KeyboardEvent.code (KeyZ → Z, Digit1 → 1, Space → Space). */
export function keyLabel(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}
