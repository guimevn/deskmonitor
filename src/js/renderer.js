import { CONFIG } from './config.js';
import { PostureState } from './posture.js';

export class WireframeRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.viewMode = CONFIG.VIEW_MODES.GHOST;
  }

  setViewMode(mode) {
    this.viewMode = mode;
  }

  /**
   * Estado visual elegante enquanto a câmera está em standby
   */
  renderStandby() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#1d1217';
    ctx.fillRect(0, 0, w, h);
    this._drawTechnicalGrid(w, h);

    const cx = w / 2;
    const cy = h / 2 - 14;

    // Halo central suave
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 120);
    grad.addColorStop(0, 'rgba(244, 114, 146, 0.18)');
    grad.addColorStop(1, 'rgba(29, 18, 23, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 120, 0, Math.PI * 2);
    ctx.fill();

    // Silhueta geométrica minimalista (cabeça + ombros)
    ctx.strokeStyle = 'rgba(244, 114, 146, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 22, 22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 56, cy + 36);
    ctx.quadraticCurveTo(cx, cy + 6, cx + 56, cy + 36);
    ctx.stroke();

    // Texto de orientação
    ctx.fillStyle = '#fce7ec';
    ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Camera em Standby', cx, cy + 84);

    ctx.fillStyle = 'rgba(244, 180, 198, 0.72)';
    ctx.font = '500 13px ui-monospace, monospace';
    ctx.fillText('Clique em "Iniciar Monitoramento" para ativar a visao local', cx, cy + 110);

    ctx.restore();
  }

  /**
   * Limpa e renderiza o quadro atual
   */
  render(videoElement, landmarks, postureResult, habitResult) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // 1. Renderização do Fundo conforme o Modo de Privacidade
    if (this.viewMode === CONFIG.VIEW_MODES.STEALTH) {
      ctx.fillStyle = '#1d1217';
      ctx.fillRect(0, 0, width, height);
      this._drawTechnicalGrid(width, height);
    } else if (this.viewMode === CONFIG.VIEW_MODES.GHOST) {
      ctx.fillStyle = '#1d1217';
      ctx.fillRect(0, 0, width, height);

      if (videoElement && videoElement.readyState >= 2) {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.globalAlpha = 0.25;
        ctx.drawImage(videoElement, 0, 0, width, height);
        ctx.restore();
      }
      this._drawTechnicalGrid(width, height);
    } else if (this.viewMode === CONFIG.VIEW_MODES.VIDEO) {
      if (videoElement && videoElement.readyState >= 2) {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, 0, 0, width, height);
        ctx.restore();
      }
    }

    // 2. Determina a cor do esqueleto com base no estado postural
    const color = this._getStateColor(postureResult ? postureResult.state : PostureState.IDLE);

    // 3. Renderiza o Wireframe Minimalista
    if (landmarks && landmarks.length > 0) {
      this._drawSkeleton(landmarks, width, height, color);
    }

    // 4. Indicadores de Hábitos Inteligentes (Hidratação & Doomscrolling)
    if (habitResult) {
      if (habitResult.isNearMouth) {
        this._drawHydrationFeedback(width, height, habitResult);
      }
      if (habitResult.isDoomscrolling) {
        this._drawDoomscrollAlert(width, height, habitResult.doomscrollSec || 0);
      }
    }

    // 5. Se estiver em calibração, desenha feedback técnico de progresso
    if (postureResult && postureResult.state === PostureState.CALIBRATING) {
      this._drawCalibrationOverlay(width, height, postureResult.progress || 0);
    }

    ctx.restore();
  }

  _getStateColor(state) {
    switch (state) {
      case PostureState.GOOD:
        return CONFIG.COLORS.GOOD;
      case PostureState.WARNING:
        return CONFIG.COLORS.WARNING;
      case PostureState.ALERT:
        return CONFIG.COLORS.ALERT;
      case PostureState.CALIBRATING:
        return CONFIG.COLORS.ACCENT;
      default:
        return CONFIG.COLORS.INACTIVE;
    }
  }

  _drawTechnicalGrid(w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = CONFIG.COLORS.GRID;
    ctx.lineWidth = 0.6;

    const step = 44;
    ctx.beginPath();
    for (let x = step; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Cruz central de referência ergonômica
    ctx.strokeStyle = 'rgba(244, 114, 146, 0.25)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h * 0.4);
    ctx.lineTo(w, h * 0.4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawSkeleton(landmarks, w, h, color) {
    const ctx = this.ctx;
    ctx.save();

    const toPx = (lm) => ({
      x: (1.0 - lm.x) * w,
      y: lm.y * h,
      v: lm.visibility !== undefined ? lm.visibility : 1.0
    });

    const nose = toPx(landmarks[0]);
    const leftEar = toPx(landmarks[7]);
    const rightEar = toPx(landmarks[8]);
    const leftShoulder = toPx(landmarks[11]);
    const rightShoulder = toPx(landmarks[12]);

    const midShoulder = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2
    };

    this._drawLine(leftShoulder, rightShoulder, color, 3);
    this._drawLine(nose, midShoulder, color, 2.5, [3, 3]);
    this._drawLine(leftEar, rightEar, color, 1.5);
    this._drawLine(nose, leftEar, color, 1.5);
    this._drawLine(nose, rightEar, color, 1.5);

    if (landmarks.length > 16) {
      const leftElbow = toPx(landmarks[13]);
      const rightElbow = toPx(landmarks[14]);
      const leftWrist = toPx(landmarks[15]);
      const rightWrist = toPx(landmarks[16]);

      if (leftElbow.v > 0.35 && leftWrist.v > 0.35) {
        this._drawLine(leftShoulder, leftElbow, color, 1.8);
        this._drawLine(leftElbow, leftWrist, color, 1.8);
        this._drawNode(leftElbow.x, leftElbow.y, color);
        this._drawNode(leftWrist.x, leftWrist.y, color);
      }

      if (rightElbow.v > 0.35 && rightWrist.v > 0.35) {
        this._drawLine(rightShoulder, rightElbow, color, 1.8);
        this._drawLine(rightElbow, rightWrist, color, 1.8);
        this._drawNode(rightElbow.x, rightElbow.y, color);
        this._drawNode(rightWrist.x, rightWrist.y, color);
      }
    }

    if (landmarks.length > 24) {
      const leftHip = toPx(landmarks[23]);
      const rightHip = toPx(landmarks[24]);
      if (leftHip.v > 0.4 && rightHip.v > 0.4) {
        this._drawLine(leftShoulder, leftHip, color, 1.5);
        this._drawLine(rightShoulder, rightHip, color, 1.5);
        this._drawLine(leftHip, rightHip, color, 2);
      }
    }

    const nodes = [nose, leftEar, rightEar, leftShoulder, rightShoulder, midShoulder];
    for (const node of nodes) {
      this._drawNode(node.x, node.y, color);
    }

    ctx.restore();
  }

  _drawLine(p1, p2, color, width = 2, dash = []) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    if (dash.length > 0) ctx.setLineDash(dash);

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  _drawNode(x, y, color) {
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  _drawCalibrationOverlay(w, h, progress) {
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = 'rgba(29, 18, 23, 0.78)';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 - 20;
    const radius = 45;

    ctx.strokeStyle = 'rgba(244, 114, 146, 0.25)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = CONFIG.COLORS.ACCENT;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * progress));
    ctx.stroke();

    ctx.fillStyle = '#fff5f7';
    ctx.font = '600 13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MANTENHA A POSTURA ERETA', cx, cy + radius + 30);

    const percent = Math.round(progress * 100);
    ctx.fillStyle = CONFIG.COLORS.ACCENT;
    ctx.font = '700 16px ui-monospace, monospace';
    ctx.fillText(`${percent}%`, cx, cy + 6);

    ctx.restore();
  }

  _drawHydrationFeedback(w, h, habit) {
    const ctx = this.ctx;
    ctx.save();

    const isRegistered = habit?.isRegistered || false;
    const holdSec = habit?.holdSec || 0;

    ctx.fillStyle = isRegistered ? 'rgba(74, 222, 128, 0.22)' : 'rgba(244, 114, 146, 0.22)';
    ctx.strokeStyle = isRegistered ? '#4ade80' : '#f47292';
    ctx.lineWidth = 1.5;

    const text = isRegistered
      ? '+1 COPO REGISTRADO (+250ml)'
      : `HIDRATACAO (${holdSec.toFixed(1)}s / ${CONFIG.HYDRATION.MIN_HOLD_SEC}s)`;

    const bx = 16;
    const by = 16;
    const bw = 250;
    const bh = 28;

    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = isRegistered ? '#86efac' : '#fbcfe8';
    ctx.font = '700 11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(text, bx + 12, by + 18);

    ctx.restore();
  }

  _drawDoomscrollAlert(w, h, sec) {
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = 'rgba(225, 55, 91, 0.28)';
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 1.5;

    const bw = 320;
    const bh = 30;
    const bx = (w - bw) / 2;
    const by = 16;

    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#ffe4e6';
    ctx.font = '700 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ATENCAO: CABECA BAIXA / CELULAR (${sec.toFixed(0)}s)`, w / 2, by + 19);

    ctx.restore();
  }
}
