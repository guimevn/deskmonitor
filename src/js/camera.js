import { CONFIG } from './config.js';

export class CameraManager {
  constructor(videoElement, onResultsCallback) {
    this.videoElement = videoElement;
    this.onResultsCallback = onResultsCallback;

    this.stream = null;
    this.pose = null;
    this.isRunning = false;
    this.lastInferenceTime = 0;
    this.isInferring = false;
    this.inferenceTimerId = null;
  }

  /**
   * Inicializa a instância do MediaPipe Pose com proteções contra falhas
   */
  async initPose() {
    if (!window.Pose) {
      throw new Error('Script do MediaPipe Pose nao encontrado no documento.');
    }

    this.pose = new window.Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    this.pose.setOptions({
      modelComplexity: 1, // 1 = Full balanceado
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.pose.onResults((results) => {
      if (this.onResultsCallback) {
        try {
          this.onResultsCallback(results);
        } catch (err) {
          console.error('[DeskMonitor] Erro ao processar telemetria do quadro:', err);
        }
      }
    });

    try {
      await this.pose.initialize();
    } catch (err) {
      console.warn('[DeskMonitor] Aguardando inicializacao lazy do MediaPipe:', err);
    }
  }

  /**
   * Inicia captura da webcam com resolução eficiente (640x360 widescreen 16:9)
   */
  async start() {
    if (this.isRunning) return;

    if (!this.pose) {
      await this.initPose();
    }

    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: 'user'
      },
      audio: false
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.videoElement.srcObject = this.stream;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;

    await new Promise((resolve) => {
      if (this.videoElement.readyState >= 2) {
        this.videoElement.play().catch(() => {}).finally(resolve);
      } else {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play().catch(() => {}).finally(resolve);
        };
      }
    });

    this.isRunning = true;
    this._startInferenceLoop();
  }

  /**
   * Interrompe o stream e os timers
   */
  stop() {
    this.isRunning = false;

    if (this.inferenceTimerId) {
      clearInterval(this.inferenceTimerId);
      this.inferenceTimerId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    this.isInferring = false;
  }

  /**
   * Loop de inferência desacoplado via setInterval regular (~300ms)
   * NUNCA bloqueia a renderização visual do canvas nem a webcam
   */
  _startInferenceLoop() {
    if (this.inferenceTimerId) {
      clearInterval(this.inferenceTimerId);
    }

    this.inferenceTimerId = setInterval(async () => {
      if (!this.isRunning) return;

      if (this.isInferring) return; // Pula se o frame anterior ainda estiver em processamento

      if (
        this.videoElement.readyState >= 2 &&
        this.videoElement.videoWidth > 0 &&
        this.videoElement.videoHeight > 0
      ) {
        this.isInferring = true;
        try {
          await this.pose.send({ image: this.videoElement });
        } catch (err) {
          console.warn('[DeskMonitor] Falha pontual na inferencia:', err);
        } finally {
          this.isInferring = false;
        }
      }
    }, CONFIG.SAMPLE_INTERVAL_MS);
  }
}
