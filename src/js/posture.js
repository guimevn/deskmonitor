import { CONFIG } from './config.js';
import { sound } from './audio.js';

export const PostureState = {
  IDLE: 'IDLE',
  CALIBRATING: 'CALIBRATING',
  GOOD: 'GOOD',
  WARNING: 'WARNING',
  ALERT: 'ALERT',
  ABSENT: 'ABSENT'
};

export class PostureAnalyzer {
  constructor() {
    this.state = PostureState.IDLE;
    this.isCalibrated = false;

    // Métricas de referência ideais gravadas na calibração
    this.reference = {
      neckHeightRatio: null,
      forwardHeadZ: null,
      shoulderTiltDeg: 0,
      shoulderWidth: null
    };

    // Amostras acumuladas durante a janela de calibração
    this.calibrationSamples = [];
    this.calibrationStartTime = null;

    // Temporizadores de debounce
    this.devianceStartTime = null;
    this.recoveryStartTime = null;

    // Filtro Passa-Baixa (EMA - Exponential Moving Average) para eliminar jitter monocular
    this.smoothed = {
      neckHeightRatio: null,
      forwardHeadZ: null,
      shoulderTiltDeg: null
    };

    // Estatísticas da sessão
    this.session = {
      startTime: null,
      lastFrameTime: null,
      totalMonitoredSec: 0,
      goodPostureSec: 0,
      badPostureSec: 0,
      absentSec: 0
    };

    // Última leitura processada e disponibilizada para a UI
    this.currentMetrics = {
      present: false,
      neckHeightRatio: 0,
      forwardHeadZ: 0,
      shoulderTiltDeg: 0,
      slouchRatioPct: 100,
      forwardDeltaZ: 0,
      tiltDeltaDeg: 0,
      isSlouching: false,
      isForwardHead: false,
      isShoulderTilted: false,
      devianceDurationSec: 0,
      deviationReasons: []
    };
  }

  startCalibration() {
    this.state = PostureState.CALIBRATING;
    this.calibrationSamples = [];
    this.calibrationStartTime = performance.now();
    this.smoothed = {
      neckHeightRatio: null,
      forwardHeadZ: null,
      shoulderTiltDeg: null
    };
  }

  resetSession() {
    this.session = {
      startTime: performance.now(),
      lastFrameTime: performance.now(),
      totalMonitoredSec: 0,
      goodPostureSec: 0,
      badPostureSec: 0,
      absentSec: 0
    };
    this.devianceStartTime = null;
    this.recoveryStartTime = null;
  }

  process(landmarks) {
    const now = performance.now();

    const presence = this._checkPresence(landmarks);
    if (!presence.present) {
      this.state = PostureState.ABSENT;
      this.currentMetrics.present = false;
      this.currentMetrics.deviationReasons = ['Usuário ausente ou pontos-chave não detectados'];
      this.devianceStartTime = null;

      if (this.session.lastFrameTime && this.isCalibrated) {
        const deltaSec = (now - this.session.lastFrameTime) / 1000;
        if (deltaSec > 0 && deltaSec < 2.0) {
          this.session.absentSec += deltaSec;
        }
      }
      this.session.lastFrameTime = now;

      return { state: this.state, metrics: this.currentMetrics, isCalibrated: this.isCalibrated };
    }

    const rawMetrics = this._calculateRawMetrics(landmarks);
    this._applySmoothing(rawMetrics);

    this.currentMetrics = {
      ...this.currentMetrics,
      ...rawMetrics,
      neckHeightRatio: this.smoothed.neckHeightRatio,
      forwardHeadZ: this.smoothed.forwardHeadZ,
      shoulderTiltDeg: this.smoothed.shoulderTiltDeg,
      present: true
    };

    if (this.state === PostureState.CALIBRATING) {
      this.session.lastFrameTime = now;
      return this._handleCalibrationStep(rawMetrics, now);
    }

    if (!this.isCalibrated) {
      this.state = PostureState.IDLE;
      this.session.lastFrameTime = now;
      return { state: this.state, metrics: this.currentMetrics, isCalibrated: false };
    }

    const result = this._evaluatePosture(this.currentMetrics, now);

    if (this.session.lastFrameTime) {
      const deltaSec = (now - this.session.lastFrameTime) / 1000;
      if (deltaSec > 0 && deltaSec < 2.0) {
        this._updateSessionCounters(deltaSec);
      }
    }
    this.session.lastFrameTime = now;

    return result;
  }

  _checkPresence(landmarks) {
    if (!landmarks || landmarks.length < 13) return { present: false };

    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    const conf = CONFIG.VISIBILITY_CONFIDENCE_THRESHOLD;
    const isVisible = (p) => p && (p.visibility === undefined || p.visibility > conf);

    if (isVisible(nose) && isVisible(leftShoulder) && isVisible(rightShoulder)) {
      return { present: true, nose, leftShoulder, rightShoulder };
    }
    return { present: false };
  }

  _calculateRawMetrics(landmarks) {
    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    const midShoulder = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
      z: (leftShoulder.z + rightShoulder.z) / 2
    };

    const shoulderWidth = Math.hypot(
      rightShoulder.x - leftShoulder.x,
      rightShoulder.y - leftShoulder.y
    );

    const safeShoulderWidth = shoulderWidth > 0.05 ? shoulderWidth : 0.25;
    const neckHeightRatio = (midShoulder.y - nose.y) / safeShoulderWidth;
    const forwardHeadZ = nose.z - midShoulder.z;

    const shoulderDeltaY = rightShoulder.y - leftShoulder.y;
    const shoulderDeltaX = Math.abs(rightShoulder.x - leftShoulder.x);
    const shoulderTiltDeg = Math.abs(Math.atan2(shoulderDeltaY, shoulderDeltaX) * (180 / Math.PI));

    return {
      midShoulder,
      shoulderWidth,
      neckHeightRatio,
      forwardHeadZ,
      shoulderTiltDeg,
      nose,
      leftEar,
      rightEar,
      leftShoulder,
      rightShoulder
    };
  }

  _applySmoothing(raw) {
    const alpha = CONFIG.SMOOTHING_ALPHA;

    if (this.smoothed.neckHeightRatio === null) {
      this.smoothed.neckHeightRatio = raw.neckHeightRatio;
      this.smoothed.forwardHeadZ = raw.forwardHeadZ;
      this.smoothed.shoulderTiltDeg = raw.shoulderTiltDeg;
    } else {
      this.smoothed.neckHeightRatio = this.smoothed.neckHeightRatio * (1 - alpha) + raw.neckHeightRatio * alpha;
      this.smoothed.forwardHeadZ = this.smoothed.forwardHeadZ * (1 - alpha) + raw.forwardHeadZ * alpha;
      this.smoothed.shoulderTiltDeg = this.smoothed.shoulderTiltDeg * (1 - alpha) + raw.shoulderTiltDeg * alpha;
    }
  }

  _handleCalibrationStep(rawMetrics, now) {
    this.calibrationSamples.push(rawMetrics);
    const elapsedSec = (now - this.calibrationStartTime) / 1000;
    const progress = Math.min(1.0, elapsedSec / CONFIG.CALIBRATION_DURATION_SEC);

    if (elapsedSec >= CONFIG.CALIBRATION_DURATION_SEC) {
      this._finalizeCalibration();
    }

    return {
      state: PostureState.CALIBRATING,
      progress,
      metrics: this.currentMetrics,
      isCalibrated: false
    };
  }

  _finalizeCalibration() {
    if (this.calibrationSamples.length === 0) return;

    let sumNeck = 0;
    let sumZ = 0;
    let sumWidth = 0;
    let sumTilt = 0;
    const count = this.calibrationSamples.length;

    for (const s of this.calibrationSamples) {
      sumNeck += s.neckHeightRatio;
      sumZ += s.forwardHeadZ;
      sumWidth += s.shoulderWidth;
      sumTilt += s.shoulderTiltDeg;
    }

    this.reference = {
      neckHeightRatio: sumNeck / count,
      forwardHeadZ: sumZ / count,
      shoulderWidth: sumWidth / count,
      shoulderTiltDeg: sumTilt / count
    };

    this.smoothed.neckHeightRatio = this.reference.neckHeightRatio;
    this.smoothed.forwardHeadZ = this.reference.forwardHeadZ;
    this.smoothed.shoulderTiltDeg = this.reference.shoulderTiltDeg;

    this.isCalibrated = true;
    this.state = PostureState.GOOD;
    this.calibrationSamples = [];
    this.resetSession();

    sound.notifySuccess();
  }

  _evaluatePosture(metrics, now) {
    const reasons = [];

    const slouchThreshold = this.reference.neckHeightRatio * CONFIG.SLOUCH_TOLERANCE_RATIO;
    const isSlouching = metrics.neckHeightRatio < slouchThreshold;
    const slouchRatioPct = (metrics.neckHeightRatio / this.reference.neckHeightRatio) * 100;
    if (isSlouching) {
      reasons.push('Coluna curvada / tronco rebaixado (slouch)');
    }

    const forwardDeltaZ = this.reference.forwardHeadZ - metrics.forwardHeadZ;
    const isForwardHead = forwardDeltaZ > CONFIG.FORWARD_HEAD_Z_TOLERANCE;
    if (isForwardHead) {
      reasons.push('Projeção anterior da cabeça (nerd neck)');
    }

    const tiltDeltaDeg = Math.abs(metrics.shoulderTiltDeg - this.reference.shoulderTiltDeg);
    const isShoulderTilted = tiltDeltaDeg > CONFIG.SHOULDER_TILT_TOLERANCE_DEG;
    if (isShoulderTilted) {
      reasons.push('Assimetria ou inclinação excessiva dos ombros');
    }

    const hasDeviation = isSlouching || isForwardHead || isShoulderTilted;

    this.currentMetrics.isSlouching = isSlouching;
    this.currentMetrics.isForwardHead = isForwardHead;
    this.currentMetrics.isShoulderTilted = isShoulderTilted;
    this.currentMetrics.slouchRatioPct = slouchRatioPct;
    this.currentMetrics.forwardDeltaZ = forwardDeltaZ;
    this.currentMetrics.tiltDeltaDeg = tiltDeltaDeg;
    this.currentMetrics.deviationReasons = reasons;

    if (hasDeviation) {
      this.recoveryStartTime = null;

      if (!this.devianceStartTime) {
        this.devianceStartTime = now;
      }

      const devianceDurationSec = (now - this.devianceStartTime) / 1000;
      this.currentMetrics.devianceDurationSec = devianceDurationSec;

      if (devianceDurationSec >= CONFIG.DEVIANCE_ALERT_DELAY_SEC) {
        if (this.state !== PostureState.ALERT) {
          this.state = PostureState.ALERT;
          sound.notifyPostureAlert();
        }
      } else {
        this.state = PostureState.WARNING;
      }
    } else {
      this.devianceStartTime = null;
      this.currentMetrics.devianceDurationSec = 0;

      if (this.state === PostureState.ALERT || this.state === PostureState.WARNING) {
        if (!this.recoveryStartTime) {
          this.recoveryStartTime = now;
        }
        const recoveryDurationSec = (now - this.recoveryStartTime) / 1000;
        if (recoveryDurationSec >= CONFIG.RECOVERY_DELAY_SEC) {
          const hadAlert = this.state === PostureState.ALERT;
          this.state = PostureState.GOOD;
          this.recoveryStartTime = null;
          if (hadAlert) {
            sound.notifyRecovery();
          }
        }
      } else {
        this.state = PostureState.GOOD;
      }
    }

    return {
      state: this.state,
      metrics: this.currentMetrics,
      reference: this.reference,
      isCalibrated: true
    };
  }

  _updateSessionCounters(deltaSec) {
    if (!this.isCalibrated) return;

    if (this.state === PostureState.ABSENT) {
      this.session.absentSec += deltaSec;
      return;
    }

    this.session.totalMonitoredSec += deltaSec;

    if (this.state === PostureState.ALERT) {
      this.session.badPostureSec += deltaSec;
    } else {
      this.session.goodPostureSec += deltaSec;
    }
  }

  getPostureScore() {
    if (this.session.totalMonitoredSec <= 0.5) return 100;
    const monitoredEffective = this.session.goodPostureSec + this.session.badPostureSec;
    if (monitoredEffective <= 0) return 100;

    const score = (this.session.goodPostureSec / monitoredEffective) * 100;
    return Math.min(100, Math.max(0, Math.round(score)));
  }
}
