import * as THREE from 'three';

// =============================================================================
// Wizard Chess Spatial 3D Audio Engine
// 100% Procedural Web Audio API Synthesis - Zero external .mp3 / 404 dependencies
// =============================================================================

class WizardChessAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 1;
  private initialized: boolean = false;
  private onStateChangeCallbacks: Array<(enabled: boolean) => void> = [];

  constructor() {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('wizard_chess_sound_enabled');
        if (saved !== null) {
          this.isMuted = saved === 'false';
        }
      } catch (e) {}
      try {
        const savedVol = window.localStorage.getItem('wizard_chess_volume');
        if (savedVol !== null) {
          const v = parseFloat(savedVol);
          if (Number.isFinite(v)) this.volume = Math.min(1, Math.max(0, v));
        }
      } catch (e) {}
    }
  }

  public init(): void {
    if (this.initialized) return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.applyGain();

      // Create procedural 2.4-second Gothic Cathedral impulse response for authentic vaulted stone acoustics
      this.reverbNode = this.createCathedralImpulseResponse(this.ctx, 2.4, 2.8);
      this.reverbNode.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.initialized = true;

      // Unlock AudioContext on first user interaction (browser autoplay policy)
      const unlockAudio = () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    } catch (e) {
      console.warn('AudioContext initialization note:', e);
    }
  }

  private ensureRunning(): boolean {
    if (!this.initialized) {
      this.init();
    }
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return !this.isMuted;
  }

  // Generate procedural stereo cathedral impulse response with early discrete reflections and diffuse stone decay
  private createCathedralImpulseResponse(ctx: AudioContext, durationSec: number, decay: number): ConvolverNode {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    // Early discrete reflections pattern (simulating sound bouncing off nearby Gothic nave pillars & high stone vaults)
    const earlyTaps = [
      { t: Math.floor(rate * 0.024), gain: 0.42 },
      { t: Math.floor(rate * 0.048), gain: 0.35 },
      { t: Math.floor(rate * 0.076), gain: 0.28 },
      { t: Math.floor(rate * 0.112), gain: 0.22 },
      { t: Math.floor(rate * 0.158), gain: 0.18 }
    ];

    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Exponential reverberation envelope with warm low-frequency stone preservation
      const env = Math.pow(1 - t, decay);
      const noiseL = (Math.random() * 2 - 1) * env;
      const noiseR = (Math.random() * 2 - 1) * env;

      left[i] = noiseL * 0.48;
      right[i] = noiseR * 0.48;
    }

    for (const tap of earlyTaps) {
      if (tap.t < length) {
        left[tap.t] += tap.gain * 0.6;
        right[tap.t + 12] += tap.gain * 0.6;
      }
    }

    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  // Update Web Audio Listener position & orientation each frame to match Three.js camera
  public updateListener(camera: THREE.Camera): void {
    if (!this.ctx || !this.ctx.listener) return;
    const listener = this.ctx.listener;
    const pos = camera.position;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    const ct = this.ctx.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(pos.x, ct);
      listener.positionY.setValueAtTime(pos.y, ct);
      listener.positionZ.setValueAtTime(pos.z, ct);
      listener.forwardX.setValueAtTime(forward.x, ct);
      listener.forwardY.setValueAtTime(forward.y, ct);
      listener.forwardZ.setValueAtTime(forward.z, ct);
      listener.upX.setValueAtTime(up.x, ct);
      listener.upY.setValueAtTime(up.y, ct);
      listener.upZ.setValueAtTime(up.z, ct);
    } else {
      // Legacy WebKit AudioContext support
      (listener as unknown as {
        setPosition: (x: number, y: number, z: number) => void;
        setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      }).setPosition(pos.x, pos.y, pos.z);
      (listener as unknown as {
        setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      }).setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // Create a spatialized 3D panner node anchored at given world coordinates
  private createPanner(worldPos: THREE.Vector3): PannerNode | null {
    if (!this.ctx) return null;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.0;
    panner.maxDistance = 28.0;
    panner.rolloffFactor = 1.25;
    panner.coneInnerAngle = 360;

    const ct = this.ctx.currentTime;
    if (panner.positionX) {
      panner.positionX.setValueAtTime(worldPos.x, ct);
      panner.positionY.setValueAtTime(worldPos.y, ct);
      panner.positionZ.setValueAtTime(worldPos.z, ct);
    } else {
      (panner as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(
        worldPos.x,
        worldPos.y,
        worldPos.z
      );
    }
    return panner;
  }

  // ===========================================================================
  // Sound Synthesizers for Cinematic Wizard Chess Capture
  // ===========================================================================

  // 1. Heavy Stone Impact & Visceral Bass Thud (No Chimes)
  public playHeavyStoneImpact(worldPos: THREE.Vector3, intensity: number = 1.0): void {
    if (!this.ensureRunning() || !this.ctx || !this.masterGain) return;
    const ct = this.ctx.currentTime;
    const panner = this.createPanner(worldPos);
    if (!panner) return;

    const impactGain = this.ctx.createGain();
    impactGain.gain.setValueAtTime(1.0 * intensity, ct);
    impactGain.connect(panner);

    // Direct dry signal + send to cathedral acoustic reverberation
    panner.connect(this.masterGain);
    if (this.reverbNode) {
      const revSend = this.ctx.createGain();
      revSend.gain.setValueAtTime(0.48 * intensity, ct);
      panner.connect(revSend);
      revSend.connect(this.reverbNode);
    }

    // A. Sub-bass solid stone punch (Visceral sub-harmonic sweep from 185Hz down to 28Hz)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(185, ct);
    subOsc.frequency.exponentialRampToValueAtTime(28, ct + 0.26);

    subGain.gain.setValueAtTime(0.95, ct);
    subGain.gain.exponentialRampToValueAtTime(0.001, ct + 0.32);

    subOsc.connect(subGain);
    subGain.connect(impactGain);
    subOsc.start(ct);
    subOsc.stop(ct + 0.35);

    // A2. Heavy stone body thump (Deep punch from 92Hz down to 34Hz)
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(92, ct);
    bodyOsc.frequency.exponentialRampToValueAtTime(34, ct + 0.18);

    bodyGain.gain.setValueAtTime(0.80, ct);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, ct + 0.22);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(impactGain);
    bodyOsc.start(ct);
    bodyOsc.stop(ct + 0.24);

    // B. High-velocity stone crack & chisel snap (Sharp transient noise burst)
    const crackLen = Math.floor(this.ctx.sampleRate * 0.05);
    const crackBuf = this.ctx.createBuffer(1, crackLen, this.ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
      crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.012));
    }
    const crackSrc = this.ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(2200, ct);
    crackFilter.Q.setValueAtTime(2.6, ct);

    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(1.0, ct);
    crackGain.gain.exponentialRampToValueAtTime(0.005, ct + 0.048);

    crackSrc.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(impactGain);
    crackSrc.start(ct);
    crackSrc.stop(ct + 0.05);

    // C. Stone acoustic body resonance (Low-mid hollow thump)
    const ringOsc = this.ctx.createOscillator();
    const ringGain = this.ctx.createGain();
    ringOsc.type = 'sine';
    ringOsc.frequency.setValueAtTime(420, ct);
    ringOsc.frequency.exponentialRampToValueAtTime(160, ct + 0.14);
    ringGain.gain.setValueAtTime(0.42, ct);
    ringGain.gain.exponentialRampToValueAtTime(0.001, ct + 0.16);

    ringOsc.connect(ringGain);
    ringGain.connect(impactGain);
    ringOsc.start(ct);
    ringOsc.stop(ct + 0.18);
  }

  // 2. Heavy King Topple Thud & Resonant Gothic Decay (Checkmate Climax - Zero Chimes)
  public playKingToppleThud(worldPos: THREE.Vector3, intensity: number = 1.25): void {
    if (!this.ensureRunning() || !this.ctx || !this.masterGain) return;
    const ct = this.ctx.currentTime;
    const panner = this.createPanner(worldPos);
    if (!panner) return;

    const crashGain = this.ctx.createGain();
    crashGain.gain.setValueAtTime(1.15 * intensity, ct);
    crashGain.connect(panner);

    panner.connect(this.masterGain);
    if (this.reverbNode) {
      const revSend = this.ctx.createGain();
      revSend.gain.setValueAtTime(0.75 * intensity, ct);
      panner.connect(revSend);
      revSend.connect(this.reverbNode);
    }

    // Heavy royal statue collapse: Sub-bass monument rumble (145Hz down to 22Hz)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(145, ct);
    subOsc.frequency.exponentialRampToValueAtTime(22, ct + 0.55);

    subGain.gain.setValueAtTime(1.0, ct);
    subGain.gain.exponentialRampToValueAtTime(0.001, ct + 0.65);

    subOsc.connect(subGain);
    subGain.connect(crashGain);
    subOsc.start(ct);
    subOsc.stop(ct + 0.70);

    // Deep stone body collision thump (78Hz down to 18Hz)
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(78, ct);
    bodyOsc.frequency.exponentialRampToValueAtTime(18, ct + 0.40);

    bodyGain.gain.setValueAtTime(0.85, ct);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, ct + 0.48);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(crashGain);
    bodyOsc.start(ct);
    bodyOsc.stop(ct + 0.50);

    // Stone slab impact crunch & debris tumble (dense low-pass noise)
    const crunchLen = Math.floor(this.ctx.sampleRate * 0.18);
    const crunchBuf = this.ctx.createBuffer(1, crunchLen, this.ctx.sampleRate);
    const crunchData = crunchBuf.getChannelData(0);
    for (let i = 0; i < crunchLen; i++) {
      crunchData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.045));
    }
    const crunchSrc = this.ctx.createBufferSource();
    crunchSrc.buffer = crunchBuf;

    const crunchFilter = this.ctx.createBiquadFilter();
    crunchFilter.type = 'lowpass';
    crunchFilter.frequency.setValueAtTime(850, ct);
    crunchFilter.frequency.exponentialRampToValueAtTime(180, ct + 0.16);

    const crunchGain = this.ctx.createGain();
    crunchGain.gain.setValueAtTime(0.9, ct);
    crunchGain.gain.exponentialRampToValueAtTime(0.01, ct + 0.17);

    crunchSrc.connect(crunchFilter);
    crunchFilter.connect(crunchGain);
    crunchGain.connect(crashGain);
    crunchSrc.start(ct);
    crunchSrc.stop(ct + 0.18);
  }

  // Rook Siege Charge & Ground Tremor
  public playRookSiegeRumble(worldPos: THREE.Vector3): void {
    if (!this.ensureRunning() || !this.ctx || !this.masterGain) return;
    const ct = this.ctx.currentTime;
    const panner = this.createPanner(worldPos);
    if (!panner) return;

    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.001, ct);
    rumbleGain.gain.linearRampToValueAtTime(0.65, ct + 0.08);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, ct + 0.38);
    rumbleGain.connect(panner);

    panner.connect(this.masterGain);

    const rumbleOsc = this.ctx.createOscillator();
    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.setValueAtTime(48, ct);
    rumbleOsc.frequency.linearRampToValueAtTime(32, ct + 0.35);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, ct);

    rumbleOsc.connect(filter);
    filter.connect(rumbleGain);
    rumbleOsc.start(ct);
    rumbleOsc.stop(ct + 0.38);
  }

  // 3. Sacred Arcane Crystal Chimes (Available for optional ambient themes, strictly disabled for captures)
  public playArcaneCrystalChimes(worldPos: THREE.Vector3): void {
    if (!this.ensureRunning() || !this.ctx || !this.masterGain) return;
    const ct = this.ctx.currentTime;
    const panner = this.createPanner(worldPos);
    if (!panner) return;

    const chimesMaster = this.ctx.createGain();
    chimesMaster.gain.setValueAtTime(0.72, ct);
    chimesMaster.connect(panner);

    panner.connect(this.masterGain);
    if (this.reverbNode) {
      const revSend = this.ctx.createGain();
      revSend.gain.setValueAtTime(0.85, ct); // Rich cathedral reverb tail
      panner.connect(revSend);
      revSend.connect(this.reverbNode);
    }

    // Sacred chord frequencies (F# minor / Dorian mystique: 528Hz Solfeggio, 792Hz, 1056Hz, 1584Hz, 2112Hz)
    const bellNotes = [
      { freq: 528, delay: 0.00, gain: 0.38, decay: 1.5 },
      { freq: 792, delay: 0.025, gain: 0.32, decay: 1.4 },
      { freq: 1056, delay: 0.055, gain: 0.26, decay: 1.2 },
      { freq: 1584, delay: 0.085, gain: 0.18, decay: 1.1 },
      { freq: 2112, delay: 0.115, gain: 0.12, decay: 0.9 }
    ];

    for (const note of bellNotes) {
      const t0 = ct + note.delay;
      const osc = this.ctx.createOscillator();
      const overtone = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, t0);

      // Subtle metallic bell overtone (non-integer partial for authentic crystal chime timbre)
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(note.freq * 2.76, t0);

      noteGain.gain.setValueAtTime(0.001, t0);
      noteGain.gain.linearRampToValueAtTime(note.gain, t0 + 0.012);
      noteGain.gain.exponentialRampToValueAtTime(0.0005, t0 + note.decay);

      const overtoneGain = this.ctx.createGain();
      overtoneGain.gain.setValueAtTime(0.18, t0);
      overtoneGain.gain.exponentialRampToValueAtTime(0.001, t0 + note.decay * 0.45);

      osc.connect(noteGain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(noteGain);
      noteGain.connect(chimesMaster);

      osc.start(t0);
      overtone.start(t0);
      osc.stop(t0 + note.decay);
      overtone.stop(t0 + note.decay);
    }
  }

  // 3. Crumbling Stone Dust & Ascending Ember Vortex Whoosh
  public playCrumblingDustWhoosh(worldPos: THREE.Vector3): void {
    if (!this.ensureRunning() || !this.ctx || !this.masterGain) return;
    const ct = this.ctx.currentTime;
    const panner = this.createPanner(worldPos);
    if (!panner) return;

    const whooshDuration = 1.35;
    const bufLen = Math.floor(this.ctx.sampleRate * whooshDuration);
    const noiseBuf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);

    // Pink-biased noise curve for textured crumbling dust
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.22;
    }

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    // Sweeping bandpass filter to emulate dust motes ascending into the vortex
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, ct);
    filter.frequency.exponentialRampToValueAtTime(1850, ct + 0.45);
    filter.frequency.exponentialRampToValueAtTime(420, ct + whooshDuration);
    filter.Q.setValueAtTime(2.2, ct);

    const whooshGain = this.ctx.createGain();
    whooshGain.gain.setValueAtTime(0.001, ct);
    whooshGain.gain.linearRampToValueAtTime(0.48, ct + 0.28);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, ct + whooshDuration);

    noiseSrc.connect(filter);
    filter.connect(whooshGain);
    whooshGain.connect(panner);

    panner.connect(this.masterGain);
    if (this.reverbNode) {
      const revSend = this.ctx.createGain();
      revSend.gain.setValueAtTime(0.65, ct);
      panner.connect(revSend);
      revSend.connect(this.reverbNode);
    }

    noiseSrc.start(ct);
    noiseSrc.stop(ct + whooshDuration);
  }

  // 4. Subtle Tactile Chess Piece Slide / Glide Across Polished Altar Board
  public playPieceSlide(worldPos: THREE.Vector3, duration: number, squaresMoved: number = 1): void {
    if (!this.ensureRunning() || !this.ctx || !this.masterGain) return;
    const ct = this.ctx.currentTime;
    const panner = this.createPanner(worldPos);
    if (!panner) return;

    const slideDuration = Math.max(0.22, Math.min(1.4, duration * 0.92));
    const sampleRate = this.ctx.sampleRate;
    const bufLen = Math.floor(sampleRate * slideDuration);
    const noiseBuf = this.ctx.createBuffer(1, bufLen, sampleRate);
    const data = noiseBuf.getChannelData(0);

    // Warm, granular sliding texture with micro-friction variations
    let b0 = 0, b1 = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.95 * b0 + white * 0.08;
      b1 = 0.88 * b1 + b0 * 0.12;
      const progress = i / bufLen;
      // Gentle modulation representing movement across tile seams
      const seamRipple = 1 + 0.18 * Math.sin(progress * squaresMoved * Math.PI * 4);
      data[i] = (b0 + b1 * 0.6 + white * 0.15) * seamRipple * 0.35;
    }

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    // Resonant bandpass filter tuned to smooth polished stone / felt sliding timbre (~780Hz to 1050Hz)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(780, ct);
    filter.frequency.linearRampToValueAtTime(1050, ct + slideDuration * 0.45);
    filter.frequency.linearRampToValueAtTime(820, ct + slideDuration);
    filter.Q.setValueAtTime(1.8, ct);

    // Subtle harmonic friction tone under the noise
    const frictionOsc = this.ctx.createOscillator();
    frictionOsc.type = 'triangle';
    frictionOsc.frequency.setValueAtTime(165, ct);
    frictionOsc.frequency.linearRampToValueAtTime(190, ct + slideDuration * 0.5);
    frictionOsc.frequency.linearRampToValueAtTime(155, ct + slideDuration);

    const frictionGain = this.ctx.createGain();
    frictionGain.gain.setValueAtTime(0.001, ct);
    frictionGain.gain.linearRampToValueAtTime(0.08, ct + 0.06);
    frictionGain.gain.exponentialRampToValueAtTime(0.001, ct + slideDuration);

    // Smooth envelope so the glide starts gently and tapers right before touchdown click
    const slideGain = this.ctx.createGain();
    slideGain.gain.setValueAtTime(0.001, ct);
    slideGain.gain.linearRampToValueAtTime(0.36, ct + 0.05);
    slideGain.gain.setValueAtTime(0.36, ct + Math.max(0.06, slideDuration - 0.08));
    slideGain.gain.exponentialRampToValueAtTime(0.001, ct + slideDuration);

    noiseSrc.connect(filter);
    filter.connect(slideGain);
    slideGain.connect(panner);

    frictionOsc.connect(frictionGain);
    frictionGain.connect(panner);

    panner.connect(this.masterGain);

    if (this.reverbNode) {
      const revSend = this.ctx.createGain();
      revSend.gain.setValueAtTime(0.18, ct); // Subtle early reflection
      panner.connect(revSend);
      revSend.connect(this.reverbNode);
    }

    noiseSrc.start(ct);
    noiseSrc.stop(ct + slideDuration);
    frictionOsc.start(ct);
    frictionOsc.stop(ct + slideDuration);
  }

  // 5. Crisp, Tactile Chess Piece Touchdown / Placement Click
  public playPiecePlacement(worldPos: THREE.Vector3, pieceType: string = 'pawn'): void {
    if (!this.ensureRunning() || !this.ctx || !this.masterGain) return;
    const ct = this.ctx.currentTime;
    const panner = this.createPanner(worldPos);
    if (!panner) return;

    const placementMaster = this.ctx.createGain();
    placementMaster.gain.setValueAtTime(0.78, ct);
    placementMaster.connect(panner);

    panner.connect(this.masterGain);
    if (this.reverbNode) {
      const revSend = this.ctx.createGain();
      revSend.gain.setValueAtTime(0.32, ct); // Crisp, pleasant cathedral acoustics
      panner.connect(revSend);
      revSend.connect(this.reverbNode);
    }

    // Piece-specific pitch & weight tuning:
    // Pawns: lighter, snappier click (higher frequencies, shorter decay)
    // Knights/Bishops: balanced medium body
    // Rooks/Queens/Kings: heavier, deeper stone resonance
    const isHeavy = pieceType === 'king' || pieceType === 'queen' || pieceType === 'rook';
    const isMedium = pieceType === 'knight' || pieceType === 'bishop';
    const baseFreq = isHeavy ? 240 : isMedium ? 295 : 355;
    const clickHighFreq = isHeavy ? 1600 : 2200;
    const totalDecay = isHeavy ? 0.16 : 0.12;

    // Layer 1: Tactile Surface Contact Impulse (Crisp, satisfying high click)
    const clickLen = Math.floor(this.ctx.sampleRate * 0.028);
    const clickBuf = this.ctx.createBuffer(1, clickLen, this.ctx.sampleRate);
    const clickData = clickBuf.getChannelData(0);
    for (let i = 0; i < clickLen; i++) {
      const env = Math.pow(1 - i / clickLen, 3.5);
      clickData[i] = (Math.random() * 2 - 1) * env * 0.95;
    }
    const clickSrc = this.ctx.createBufferSource();
    clickSrc.buffer = clickBuf;

    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.setValueAtTime(clickHighFreq, ct);

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.68, ct);
    clickGain.gain.exponentialRampToValueAtTime(0.001, ct + 0.028);

    clickSrc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(placementMaster);
    clickSrc.start(ct);

    // Layer 2: Resonant Piece Body Tone (Warm wood/stone body tap)
    const bodyOsc = this.ctx.createOscillator();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(baseFreq * 1.25, ct);
    bodyOsc.frequency.exponentialRampToValueAtTime(baseFreq, ct + 0.035);

    const bodyOsc2 = this.ctx.createOscillator();
    bodyOsc2.type = 'triangle';
    bodyOsc2.frequency.setValueAtTime(baseFreq * 2.05, ct);
    bodyOsc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ct + 0.04);

    const bodyGain = this.ctx.createGain();
    bodyGain.gain.setValueAtTime(0.001, ct);
    bodyGain.gain.linearRampToValueAtTime(0.72, ct + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, ct + totalDecay);

    bodyOsc.connect(bodyGain);
    bodyOsc2.connect(bodyGain);
    bodyGain.connect(placementMaster);

    bodyOsc.start(ct);
    bodyOsc2.start(ct);
    bodyOsc.stop(ct + totalDecay);
    bodyOsc2.stop(ct + totalDecay);

    // Layer 3: Low-End Altar Board Thud (Solid grounded presence)
    const thudOsc = this.ctx.createOscillator();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(isHeavy ? 95 : 125, ct);
    thudOsc.frequency.exponentialRampToValueAtTime(55, ct + 0.065);

    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(isHeavy ? 0.42 : 0.28, ct);
    thudGain.gain.exponentialRampToValueAtTime(0.001, ct + 0.07);

    thudOsc.connect(thudGain);
    thudGain.connect(placementMaster);
    thudOsc.start(ct);
    thudOsc.stop(ct + 0.075);
  }

  // 6. Clock Tick for Time Controls & Low Time Urgency
  public playClockTick(isUrgent: boolean = false): void {
    if (!this.ensureRunning() || !this.ctx || !this.masterGain) return;
    const ct = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isUrgent ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isUrgent ? 880 : 540, ct);
    osc.frequency.exponentialRampToValueAtTime(isUrgent ? 440 : 270, ct + 0.035);
    gain.gain.setValueAtTime(isUrgent ? 0.28 : 0.14, ct);
    gain.gain.exponentialRampToValueAtTime(0.001, ct + 0.04);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(ct);
    osc.stop(ct + 0.045);
  }

  // Orchestrated full capture sequence sound (Deep Stone Crack + Crumbling Dust, No Chimes)
  public playCaptureAudioSequence(worldPos: THREE.Vector3): void {
    this.playHeavyStoneImpact(worldPos, 1.0);
    setTimeout(() => {
      this.playCrumblingDustWhoosh(worldPos);
    }, 120);
  }

  // Toggle sound on/off
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem('wizard_chess_sound_enabled', String(!this.isMuted));
      } catch (e) {}
    }
    this.applyGain();
    for (const cb of this.onStateChangeCallbacks) {
      cb(!this.isMuted);
    }
    return !this.isMuted;
  }

  // Master volume 0..1 with localStorage persistence
  public setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, Number(v)));
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem('wizard_chess_volume', String(this.volume));
      } catch (e) {}
    }
    this.applyGain();
  }

  public getVolume(): number {
    return this.volume;
  }

  private applyGain(): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.82 * this.volume, this.ctx.currentTime);
    }
  }

  public isEnabled(): boolean {
    return !this.isMuted;
  }

  public onStateChange(cb: (enabled: boolean) => void): void {
    this.onStateChangeCallbacks.push(cb);
  }
}

export const wizardChessAudio = new WizardChessAudioEngine();
