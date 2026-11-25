/**
 * Síntese de áudio minimalista via Web Audio API.
 * Gera chimes suaves e discretos sem dependências de arquivos de som externos.
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.2; // Volume confortável e baixo por padrão
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle(enabled) {
    this.enabled = enabled;
  }

  playTone(freq, duration = 1.0, type = 'sine', gainMultiplier = 1.0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    // Envelope ADSR suave (ataque macio de 40ms, decaimento exponencial)
    const targetGain = this.volume * gainMultiplier;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(targetGain, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Notificação de calibração concluída: acorde suave ascendente
   */
  notifySuccess() {
    if (!this.enabled) return;
    this.playTone(523.25, 0.7, 'sine', 0.8); // C5
    setTimeout(() => {
      this.playTone(659.25, 0.9, 'sine', 1.0); // E5
    }, 120);
    setTimeout(() => {
      this.playTone(783.99, 1.2, 'sine', 0.9); // G5
    }, 240);
  }

  /**
   * Alerta suave de desvio postural sustentado: chime harmônico sutil
   */
  notifyPostureAlert() {
    if (!this.enabled) return;
    this.playTone(440.0, 1.4, 'sine', 0.8); // A4
    this.playTone(880.0, 1.2, 'sine', 0.2); // Harmônico superior sutil
  }

  /**
   * Som de restauração de postura: toque discreto de alívio
   */
  notifyRecovery() {
    if (!this.enabled) return;
    this.playTone(587.33, 0.8, 'sine', 0.6); // D5
  }

  /**
   * Notificação de hidratação detectada: chime cristalino e ascendente
   */
  notifyHydration() {
    if (!this.enabled) return;
    this.playTone(659.25, 0.5, 'sine', 0.7); // E5
    setTimeout(() => {
      this.playTone(987.77, 0.8, 'sine', 0.9); // B5
    }, 100);
    setTimeout(() => {
      this.playTone(1318.51, 1.1, 'sine', 0.6); // E6
    }, 200);
  }

  /**
   * Alerta suave de doomscrolling (cabeça baixa por tempo excessivo)
   */
  notifyDoomscroll() {
    if (!this.enabled) return;
    this.playTone(392.0, 0.6, 'sine', 0.7); // G4
    setTimeout(() => {
      this.playTone(349.23, 0.9, 'sine', 0.7); // F4
    }, 180);
  }
}

export const sound = new SoundEngine();
