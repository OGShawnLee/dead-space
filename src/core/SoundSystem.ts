/**
 * Web Audio API Procedural Synthesizer
 * 100% synthesized sound effects with zero external audio files.
 */
export class SoundSystem {
  ctx: AudioContext | null = null;
  initialized = false;
  masterGain: GainNode | null = null;
  droneOsc: OscillatorNode | null = null;
  masterVolume = 0.55;

  init(): void {
    if (this.initialized) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
    this.initialized = true;
    this.startAmbientDrone();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playPlasmaShot(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.14);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);

    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.Q.setValueAtTime(4, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
  }

  playPlasmaEmpty(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playReload(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const click = (time: number, freq: number, dur: number) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + dur);
    };

    click(now, 1400, 0.06);
    click(now + 0.18, 520, 0.12);
  }

  playDismember(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    gain.gain.setValueAtTime(0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.23);

    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.8, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
  }

  playNecroGrowl(screech = false): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    if (screech) {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.42);
      mod.frequency.setValueAtTime(40, now);
      modGain.gain.setValueAtTime(300, now);
      gain.gain.setValueAtTime(0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(85, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.48);
      mod.frequency.setValueAtTime(16, now);
      modGain.gain.setValueAtTime(120, now);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    }

    mod.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(this.masterGain);

    mod.start(now);
    osc.start(now);
    mod.stop(now + 0.52);
    osc.stop(now + 0.52);
  }

  playNecroAttack(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
    gain.gain.setValueAtTime(0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  playPlayerHurt(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    gain.gain.setValueAtTime(0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playMedkit(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1800, now);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.4, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);

    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now + 0.1);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);
    oGain.gain.setValueAtTime(0.01, now);
    oGain.gain.setValueAtTime(0.35, now + 0.1);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(now + 0.1);
    osc.stop(now + 0.42);
  }

  playFootstep(isRunning: boolean): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.08);
    const vol = isRunning ? 0.35 : 0.2;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playFlashlight(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2200, now);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  playHeartbeatThump(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const thump = (time: number, freq: number, vol: number) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(25, time + 0.12);
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.16);
    };

    thump(now, 75, 0.7);
    thump(now + 0.14, 55, 0.5);
  }

  playExplosion(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Sub-bass shockwave
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(150, now);
    subOsc.frequency.exponentialRampToValueAtTime(18, now + 0.65);
    subGain.gain.setValueAtTime(1.4, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.72);

    // Crackling blast noise
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.55);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(70, now + 0.55);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(1.2, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);
  }

  playExploderSqueal(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.35);
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  playLeaperScreech(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(310, now + 0.4);

    mod.frequency.setValueAtTime(75, now);
    modGain.gain.setValueAtTime(460, now);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    mod.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(this.masterGain);

    mod.start(now);
    osc.start(now);
    mod.stop(now + 0.44);
    osc.stop(now + 0.44);
  }

  playStasisFire(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1250, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.38);

    mod.type = 'sine';
    mod.frequency.setValueAtTime(45, now);
    mod.frequency.linearRampToValueAtTime(12, now + 0.38);
    modGain.gain.setValueAtTime(220, now);
    modGain.gain.linearRampToValueAtTime(10, now + 0.38);

    gain.gain.setValueAtTime(0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    mod.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(this.masterGain);

    mod.start(now);
    osc.start(now);
    mod.stop(now + 0.42);
    osc.stop(now + 0.42);
  }

  playStasisHit(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.55);

    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.62);

    const bufferSize = Math.floor(this.ctx.sampleRate * 0.35);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(6, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
  }

  playStasisEmpty(): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.setValueAtTime(80, now + 0.08);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  startAmbientDrone(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.droneOsc) return;
    const now = this.ctx.currentTime;
    this.droneOsc = this.ctx.createOscillator();
    const droneGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    this.droneOsc.type = 'sawtooth';
    this.droneOsc.frequency.setValueAtTime(54, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);

    droneGain.gain.setValueAtTime(0.2, now);

    this.droneOsc.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(this.masterGain);
    this.droneOsc.start();
  }
  /** Sets master output volume (0..1). Applied immediately if the audio graph exists. */
  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.03);
    }
  }

  /** Short holographic tick used when moving focus between menu entries. */
  playUiMove(): void {
    this.uiBlip(1450, 1250, 0.05, 0.08, 'triangle');
  }

  /** Confirmation chirp when activating a menu entry. */
  playUiSelect(): void {
    this.uiBlip(880, 1760, 0.09, 0.14, 'square');
  }

  /** Descending chirp when backing out of a submenu. */
  playUiBack(): void {
    this.uiBlip(1100, 480, 0.1, 0.12, 'triangle');
  }

  /** Subtle pneumatic tick when adjusting sliders / toggles. */
  playUiAdjust(): void {
    this.uiBlip(2100, 1900, 0.035, 0.07, 'sine');
  }

  private uiBlip(f0: number, f1: number, dur: number, vol: number, type: OscillatorType): void {
    if (!this.initialized || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f1, now + dur);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3800, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }
}
