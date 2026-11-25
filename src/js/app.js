import { CONFIG } from './config.js';
import { sound } from './audio.js';
import { PostureAnalyzer, PostureState } from './posture.js';
import { WireframeRenderer } from './renderer.js';
import { CameraManager } from './camera.js';
import { HydrationTracker, DoomscrollDetector, FocusManager } from './habits.js';
import { DeskBonsai } from './bonsai.js';

class DeskMonitorApp {
  constructor() {
    this.analyzer = new PostureAnalyzer();
    this.renderer = null;
    this.camera = null;
    this.bonsai = null;
    this.audioEnabled = true;

    this.hydration = new HydrationTracker((ev) => this._onHydrationEvent(ev));
    this.doomscroll = new DoomscrollDetector((ev) => this._onDoomscrollEvent(ev));
    this.focus = new FocusManager((state, data) => this._onFocusStateChange(state, data));

    this.dom = {
      video: document.getElementById('webcam-video'),
      canvas: document.getElementById('wireframe-canvas'),
      bonsaiContainer: document.getElementById('bonsai-container'),
      btnToggleCamera: document.getElementById('btn-toggle-camera'),
      btnCalibrate: document.getElementById('btn-calibrate'),
      btnAudioToggle: document.getElementById('btn-audio-toggle'),
      btnModeGhost: document.getElementById('btn-mode-ghost'),
      btnModeVideo: document.getElementById('btn-mode-video'),
      btnModeStealth: document.getElementById('btn-mode-stealth'),
      statusBadge: document.getElementById('status-badge'),
      statusDescription: document.getElementById('status-description'),
      postureScoreText: document.getElementById('posture-score-text'),
      postureScoreBar: document.getElementById('posture-score-bar'),
      timeGoodPosture: document.getElementById('time-good-posture'),
      timeTotalMonitored: document.getElementById('time-total-monitored'),
      deviationTimerBadge: document.getElementById('deviation-timer-badge'),
      metricSlouch: document.getElementById('metric-slouch'),
      metricNerdNeck: document.getElementById('metric-nerd-neck'),
      metricShoulderTilt: document.getElementById('metric-shoulder-tilt'),
      refNeckRatio: document.getElementById('ref-neck-ratio'),
      refForwardZ: document.getElementById('ref-forward-z'),
      eventLogContainer: document.getElementById('event-log-container'),

      waterGlassesText: document.getElementById('water-glasses-text'),
      waterMlText: document.getElementById('water-ml-text'),
      waterProgressBar: document.getElementById('water-progress-bar'),
      btnWaterAdd: document.getElementById('btn-water-add'),
      btnWaterSub: document.getElementById('btn-water-sub'),

      focusTimeText: document.getElementById('focus-time-text'),
      focusStatusBadge: document.getElementById('focus-status-badge'),
      btnFocusToggle: document.getElementById('btn-focus-toggle'),
      btnFocusReset: document.getElementById('btn-focus-reset'),

      doomscrollBadge: document.getElementById('doomscroll-badge')
    };

    this.lastState = null;
    this.lastLandmarks = [];
    this.lastEvaluation = null;
    this.lastHabitResult = null;
    this.renderAnimId = null;
  }

  init() {
    this.renderer = new WireframeRenderer(this.dom.canvas);
    this.renderer.renderStandby();
    this.camera = new CameraManager(this.dom.video, (results) => this.onFrameResults(results));

    if (this.dom.bonsaiContainer) {
      this.bonsai = new DeskBonsai(this.dom.bonsaiContainer, (level) => {
        if (this.audioEnabled) sound.notifyHydration();
        this._addLog(`Sakura Bonsai evoluiu para o Nivel ${level}.`);
      });
      this.bonsai.render();
    }

    this._bindEvents();
    this._updateHydrationUI();
    this._updateFocusUI();
    this._addLog('Sistema inicializado. Conceda acesso a webcam para monitoramento local.');

    window.addEventListener('beforeunload', () => {
      if (this.bonsai) this.bonsai.saveState();
    });
  }

  _bindEvents() {
    this.dom.btnToggleCamera.addEventListener('click', () => this.toggleMonitoring());

    this.dom.btnCalibrate.addEventListener('click', () => {
      if (!this.camera.isRunning) {
        this._addLog('Inicie a camera antes de executar a calibracao.');
        return;
      }
      this._addLog('Iniciando calibracao de 3 segundos... Sente-se ereto.');
      this.analyzer.startCalibration();
      this.dom.btnCalibrate.disabled = true;
    });

    this.dom.btnModeGhost.addEventListener('click', () => this.setViewMode(CONFIG.VIEW_MODES.GHOST));
    this.dom.btnModeVideo.addEventListener('click', () => this.setViewMode(CONFIG.VIEW_MODES.VIDEO));
    this.dom.btnModeStealth.addEventListener('click', () => this.setViewMode(CONFIG.VIEW_MODES.STEALTH));

    this.dom.btnAudioToggle.addEventListener('click', () => {
      this.audioEnabled = !this.audioEnabled;
      sound.toggle(this.audioEnabled);
      this._updateAudioButtonUI();
      this._addLog(`Feedback sonoro ${this.audioEnabled ? 'ativado' : 'silenciado'}.`);
    });

    this.dom.btnWaterAdd.addEventListener('click', () => this.hydration.addManualGlass());
    this.dom.btnWaterSub.addEventListener('click', () => this.hydration.removeManualGlass());

    this.dom.btnFocusToggle.addEventListener('click', () => {
      const state = this.focus.toggleActive();
      this._updateFocusUI();
      this._addLog(`Timer de foco ${state.isActive ? 'iniciado/retomado' : 'pausado manualmente'}.`);
    });

    this.dom.btnFocusReset.addEventListener('click', () => {
      this.focus.reset();
      this._updateFocusUI();
      this._addLog('Timer de foco reiniciado.');
    });
  }

  async toggleMonitoring() {
    if (this.camera.isRunning) {
      this.camera.stop();
      if (this.renderAnimId) {
        cancelAnimationFrame(this.renderAnimId);
        this.renderAnimId = null;
      }
      this.renderer.renderStandby();
      this.dom.btnToggleCamera.innerHTML = `
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>Iniciar Monitoramento</span>
      `;
      this.dom.btnCalibrate.disabled = true;
      this._updateStatusBadge(PostureState.IDLE, null);
      this._addLog('Monitoramento pausado pelo usuario.');
    } else {
      try {
        this.dom.btnToggleCamera.disabled = true;
        this.dom.btnToggleCamera.textContent = 'Iniciando Camera...';
        await this.camera.start();
        this._startRenderLoop();
        this.dom.btnToggleCamera.disabled = false;
        this.dom.btnToggleCamera.innerHTML = `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>Pausar Monitoramento</span>
        `;
        this.dom.btnCalibrate.disabled = false;
        this._addLog('Camera conectada. Modelo local MediaPipe Pose ativo.');

        if (!this.analyzer.isCalibrated) {
          setTimeout(() => {
            if (this.camera.isRunning && !this.analyzer.isCalibrated) {
              this.analyzer.startCalibration();
              this._addLog('Calibracao automatica inicial iniciada (3 segundos)...');
            }
          }, 1200);
        }
      } catch (err) {
        console.error(err);
        this.dom.btnToggleCamera.disabled = false;
        this.dom.btnToggleCamera.innerHTML = `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>Iniciar Monitoramento</span>
        `;
        this._addLog(`Erro ao acessar camera: ${err.message || 'Permissao negada'}`);
      }
    }
  }

  _startRenderLoop() {
    if (this.renderAnimId) {
      cancelAnimationFrame(this.renderAnimId);
    }

    const render = () => {
      if (!this.camera.isRunning) return;

      if (this.dom.video.readyState >= 2) {
        if (this.dom.video.videoWidth && this.dom.canvas.width !== this.dom.video.videoWidth) {
          this.dom.canvas.width = this.dom.video.videoWidth;
          this.dom.canvas.height = this.dom.video.videoHeight;
        }

        try {
          this.renderer.render(
            this.dom.video,
            this.lastLandmarks,
            this.lastEvaluation,
            this.lastHabitResult
          );
        } catch (err) {
          console.error('[DeskMonitor] Erro na renderizacao do canvas:', err);
        }
      }

      this.renderAnimId = requestAnimationFrame(render);
    };

    this.renderAnimId = requestAnimationFrame(render);
  }

  setViewMode(mode) {
    this.renderer.setViewMode(mode);
    const activeClasses = ['bg-[#24171a]', 'text-[#fff5f7]', 'shadow-sm'];
    const inactiveClasses = ['bg-transparent', 'text-[#6e4f56]', 'hover:text-[#24171a]'];

    const setBtnState = (btn, isActive) => {
      if (isActive) {
        btn.classList.add(...activeClasses);
        btn.classList.remove(...inactiveClasses);
      } else {
        btn.classList.remove(...activeClasses);
        btn.classList.add(...inactiveClasses);
      }
    };

    setBtnState(this.dom.btnModeGhost, mode === CONFIG.VIEW_MODES.GHOST);
    setBtnState(this.dom.btnModeVideo, mode === CONFIG.VIEW_MODES.VIDEO);
    setBtnState(this.dom.btnModeStealth, mode === CONFIG.VIEW_MODES.STEALTH);

    this._addLog(`Modo visual alterado para: ${mode.toUpperCase()}`);
  }

  _updateAudioButtonUI() {
    if (this.audioEnabled) {
      this.dom.btnAudioToggle.innerHTML = `
        <svg class="w-3.5 h-3.5 text-[#e1375b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
        </svg>
        <span class="text-[11px] font-semibold text-[#24171a]">Sons Ativos</span>
      `;
    } else {
      this.dom.btnAudioToggle.innerHTML = `
        <svg class="w-3.5 h-3.5 text-[#9c7b83]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
        </svg>
        <span class="text-[11px] font-semibold text-[#9c7b83]">Silenciado</span>
      `;
    }
  }

  onFrameResults(results) {
    this.lastLandmarks = results.poseLandmarks || [];
    this.lastEvaluation = this.analyzer.process(this.lastLandmarks);

    const effectiveWidth = this.analyzer.reference.shoulderWidth || this.lastEvaluation.metrics?.shoulderWidth || 0.25;
    const hydrationRes = this.hydration.process(this.lastLandmarks, effectiveWidth);
    const doomscrollRes = this.doomscroll.process(this.lastLandmarks, effectiveWidth);
    const focusState = this.focus.process(this.lastEvaluation.metrics.present);

    this.lastHabitResult = {
      isNearMouth: hydrationRes.isNearMouth,
      isDoomscrolling: doomscrollRes.isDoomscrolling,
      doomscrollSec: doomscrollRes.durationSec,
      holdSec: hydrationRes.holdDurationSec,
      isRegistered: hydrationRes.isRegistered
    };

    this._updateTelemetryUI(this.lastEvaluation);
    this._updateDoomscrollUI(doomscrollRes);
    this._updateFocusUI(focusState);

    if (this.bonsai) {
      this.bonsai.update(
        this.analyzer.getPostureScore(),
        this.analyzer.state === PostureState.ALERT,
        this.hydration.glasses,
        Math.floor(this.focus.focusedSeconds / 60)
      );
    }

    if (this.analyzer.state !== PostureState.CALIBRATING && this.dom.btnCalibrate.disabled) {
      this.dom.btnCalibrate.disabled = false;
    }
  }

  _onHydrationEvent(data) {
    this._updateHydrationUI();
    if (this.bonsai && data.addedMl > 0) {
      this.bonsai.addXp(40);
    }
    const origin = data.auto ? 'deteccao visual' : 'ajuste manual';
    const sign = data.addedMl >= 0 ? '+' : '-';
    const unit = data.glasses === 1 ? 'copo' : 'copos';
    this._addLog(`Hidratacao: ${sign}${Math.abs(data.addedMl)}ml (${data.glasses} ${unit} / ${data.totalMl}ml) via ${origin}.`);
  }

  _onDoomscrollEvent(data) {
    this._addLog(`Alerta de Foco: flexao cervical para baixo mantida por ${data.durationSec.toFixed(0)}s.`);
  }

  _onFocusStateChange(state) {
    if (state === 'AUTO_PAUSED') {
      this._addLog(`Timer de foco pausado automaticamente: cadeira vazia por > ${CONFIG.FOCUS.PRESENCE_TIMEOUT_SEC}s.`);
    } else if (state === 'RESUMED') {
      this._addLog('Presenca confirmada no assento: timer de foco retomado.');
    }
    this._updateFocusUI();
  }

  _updateHydrationUI() {
    const glasses = this.hydration.glasses;
    const totalMl = this.hydration.totalMl;
    const goalMl = this.hydration.goalMl;
    const pct = Math.min(100, Math.round((totalMl / goalMl) * 100));

    this.dom.waterGlassesText.textContent = `${glasses} ${glasses === 1 ? 'copo' : 'copos'}`;
    this.dom.waterMlText.textContent = `${totalMl} / ${goalMl} ml`;
    this.dom.waterProgressBar.style.width = `${pct}%`;
  }

  _updateFocusUI(state) {
    const focusState = state || this.focus.getState();
    const timeFormatted = this._formatHoursMinutesSeconds(focusState.focusedSeconds);
    this.dom.focusTimeText.textContent = timeFormatted;

    const badge = this.dom.focusStatusBadge;
    if (focusState.isAutoPaused) {
      badge.textContent = 'AUSENTE';
      badge.className = 'px-1.5 py-0.5 text-[8px] font-mono font-bold rounded-full bg-[#fef3e2] text-[#9a550c] border border-[#f3cfa0]';
    } else if (!focusState.isActive) {
      badge.textContent = 'PAUSA';
      badge.className = 'px-1.5 py-0.5 text-[8px] font-mono font-bold rounded-full bg-[#f5e6ea] text-[#7c5c64] border border-[#e5c8d0]';
    } else {
      badge.textContent = 'ATIVO';
      badge.className = 'px-1.5 py-0.5 text-[8px] font-mono font-bold rounded-full bg-[#e6f6ef] text-[#1b5e43] border border-[#a7dfc7]';
    }
  }

  _updateDoomscrollUI(doomscrollRes) {
    const badge = this.dom.doomscrollBadge;
    if (doomscrollRes.isDoomscrolling) {
      badge.textContent = `Cabeca Baixa (${doomscrollRes.durationSec.toFixed(0)}s)`;
      badge.className = 'text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#fde8ed] text-[#be123c] border border-[#f8a9bc] animate-pulse';
    } else if (doomscrollRes.isLookingDown && doomscrollRes.durationSec > 3) {
      badge.textContent = `Inclinado (${doomscrollRes.durationSec.toFixed(0)}s / 15s)`;
      badge.className = 'text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#fef3e2] text-[#9a550c] border border-[#f3cfa0]';
    } else {
      badge.textContent = 'Visao Frontal Nominal';
      badge.className = 'text-[9px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#fdf2f5] text-[#6e4f56] border border-[#edd0d8]';
    }
  }

  _updateTelemetryUI(evaluation) {
    const { state, metrics, progress } = evaluation;

    if (state !== this.lastState) {
      this._onStateTransition(this.lastState, state);
      this.lastState = state;
    }

    this._updateStatusBadge(state, metrics, progress);

    const score = this.analyzer.getPostureScore();
    this.dom.postureScoreText.textContent = `${score}%`;
    this.dom.postureScoreBar.style.width = `${score}%`;

    if (score >= 80) {
      this.dom.postureScoreBar.className = 'h-full bg-[#237a57] rounded-full transition-all duration-300';
      this.dom.postureScoreText.className = 'text-base font-mono font-bold text-[#237a57]';
    } else if (score >= 60) {
      this.dom.postureScoreBar.className = 'h-full bg-[#c47316] rounded-full transition-all duration-300';
      this.dom.postureScoreText.className = 'text-base font-mono font-bold text-[#c47316]';
    } else {
      this.dom.postureScoreBar.className = 'h-full bg-[#e1375b] rounded-full transition-all duration-300';
      this.dom.postureScoreText.className = 'text-base font-mono font-bold text-[#e1375b]';
    }

    this.dom.timeGoodPosture.textContent = this._formatTime(this.analyzer.session.goodPostureSec);
    this.dom.timeTotalMonitored.textContent = `/ ${this._formatTime(this.analyzer.session.totalMonitoredSec)}`;

    if (metrics.devianceDurationSec > 0) {
      const remainingSec = Math.max(0, CONFIG.DEVIANCE_ALERT_DELAY_SEC - metrics.devianceDurationSec);
      if (metrics.devianceDurationSec >= CONFIG.DEVIANCE_ALERT_DELAY_SEC) {
        this.dom.deviationTimerBadge.textContent = `Desvio (${metrics.devianceDurationSec.toFixed(1)}s)`;
        this.dom.deviationTimerBadge.className = 'text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#fde8ed] text-[#be123c] border border-[#f8a9bc] flex-shrink-0';
      } else {
        this.dom.deviationTimerBadge.textContent = `Alerta em ${remainingSec.toFixed(1)}s`;
        this.dom.deviationTimerBadge.className = 'text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#fef3e2] text-[#9a550c] border border-[#f3cfa0] flex-shrink-0';
      }
    } else {
      this.dom.deviationTimerBadge.textContent = 'Postura nominal';
      this.dom.deviationTimerBadge.className = 'text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#e6f6ef] text-[#1b5e43] border border-[#a7dfc7] flex-shrink-0';
    }

    if (metrics.present && this.analyzer.isCalibrated) {
      const slouchPct = metrics.slouchRatioPct.toFixed(0);
      this.dom.metricSlouch.textContent = metrics.isSlouching ? `Curvado (${slouchPct}%)` : `OK (${slouchPct}%)`;
      this.dom.metricSlouch.className = `font-mono text-[10px] font-bold ${metrics.isSlouching ? 'text-[#e1375b]' : 'text-[#237a57]'}`;

      const deltaZStr = (metrics.forwardDeltaZ >= 0 ? '+' : '') + metrics.forwardDeltaZ.toFixed(3);
      this.dom.metricNerdNeck.textContent = metrics.isForwardHead ? `Avanc. (${deltaZStr})` : `OK (${deltaZStr})`;
      this.dom.metricNerdNeck.className = `font-mono text-[10px] font-bold ${metrics.isForwardHead ? 'text-[#e1375b]' : 'text-[#237a57]'}`;

      const tiltDeltaStr = `${metrics.tiltDeltaDeg.toFixed(1)}°`;
      this.dom.metricShoulderTilt.textContent = metrics.isShoulderTilted ? `Desal. (${tiltDeltaStr})` : `OK (${tiltDeltaStr})`;
      this.dom.metricShoulderTilt.className = `font-mono text-[10px] font-bold ${metrics.isShoulderTilted ? 'text-[#c47316]' : 'text-[#237a57]'}`;
    } else if (metrics.present) {
      this.dom.metricSlouch.textContent = 'Calibrar';
      this.dom.metricSlouch.className = 'font-mono text-[10px] text-[#8c6b73]';
      this.dom.metricNerdNeck.textContent = 'Calibrar';
      this.dom.metricNerdNeck.className = 'font-mono text-[10px] text-[#8c6b73]';
      this.dom.metricShoulderTilt.textContent = 'Calibrar';
      this.dom.metricShoulderTilt.className = 'font-mono text-[10px] text-[#8c6b73]';
    } else {
      this.dom.metricSlouch.textContent = '--';
      this.dom.metricSlouch.className = 'font-mono text-[10px] text-[#a3848c]';
      this.dom.metricNerdNeck.textContent = '--';
      this.dom.metricNerdNeck.className = 'font-mono text-[10px] text-[#a3848c]';
      this.dom.metricShoulderTilt.textContent = '--';
      this.dom.metricShoulderTilt.className = 'font-mono text-[10px] text-[#a3848c]';
    }

    if (this.analyzer.isCalibrated) {
      this.dom.refNeckRatio.textContent = this.analyzer.reference.neckHeightRatio.toFixed(2);
      this.dom.refForwardZ.textContent = this.analyzer.reference.forwardHeadZ.toFixed(3);
    }
  }

  _updateStatusBadge(state, metrics, progress) {
    const badge = this.dom.statusBadge;
    const desc = this.dom.statusDescription;

    switch (state) {
      case PostureState.CALIBRATING: {
        const pct = Math.round((progress || 0) * 100);
        badge.textContent = `CALIBRANDO ${pct}%`;
        badge.className = 'px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-[#fce7ec] text-[#e1375b] border border-[#f5b4c4] flex-shrink-0';
        desc.textContent = 'Mantenha a postura neutra ereta olhando para o centro da tela.';
        break;
      }
      case PostureState.GOOD:
        badge.textContent = 'ALINHADO';
        badge.className = 'px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-[#e6f6ef] text-[#1b5e43] border border-[#a7dfc7] flex-shrink-0';
        desc.textContent = 'Coluna e cervical alinhadas com a referencia calibrada.';
        break;
      case PostureState.WARNING:
        badge.textContent = 'DESVIO';
        badge.className = 'px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-[#fef3e2] text-[#9a550c] border border-[#f3cfa0] flex-shrink-0';
        desc.textContent = metrics?.deviationReasons?.join(', ') || 'Desvio detectado dentro da janela de tolerancia.';
        break;
      case PostureState.ALERT:
        badge.textContent = 'ALERTA';
        badge.className = 'px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-[#fde8ed] text-[#be123c] border border-[#f8a9bc] animate-pulse flex-shrink-0';
        desc.textContent = metrics?.deviationReasons?.join(', ') || 'Postura incorreta sustentada alem do limite.';
        break;
      case PostureState.ABSENT:
        badge.textContent = 'AUSENTE';
        badge.className = 'px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-[#f5e6ea] text-[#7c5c64] border border-[#e5c8d0] flex-shrink-0';
        desc.textContent = 'Usuario fora do enquadramento da camera.';
        break;
      case PostureState.IDLE:
      default:
        badge.textContent = 'STANDBY';
        badge.className = 'px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-[#f5e6ea] text-[#6e4f56] border border-[#e5c8d0] flex-shrink-0';
        desc.textContent = 'Inicie o monitoramento para processamento local de postura.';
        break;
    }
  }

  _onStateTransition(oldState, newState) {
    if (newState === PostureState.ALERT) {
      this._addLog('Alerta emitido: desvio postural sustentado por mais de 8s.');
    } else if (newState === PostureState.GOOD && oldState === PostureState.ALERT) {
      this._addLog('Postura restaurada com sucesso.');
    } else if (newState === PostureState.ABSENT && oldState !== PostureState.ABSENT) {
      this._addLog('Usuario ausente do enquadramento.');
    } else if (newState === PostureState.GOOD && oldState === PostureState.CALIBRATING) {
      this._addLog('Calibracao concluida. Referencias anatomicas gravadas.');
    }
  }

  _addLog(message) {
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    const entry = document.createElement('div');
    entry.className = 'text-[10px] font-mono text-[#5c3a43] flex items-start gap-2 py-0.5 border-b border-[#f5dfe5]';
    entry.innerHTML = `
      <span class="text-[#a8828c] select-none flex-shrink-0">[${timestamp}]</span>
      <span class="text-[#2c191e]">${message}</span>
    `;

    this.dom.eventLogContainer.insertBefore(entry, this.dom.eventLogContainer.firstChild);

    while (this.dom.eventLogContainer.children.length > 30) {
      this.dom.eventLogContainer.removeChild(this.dom.eventLogContainer.lastChild);
    }
  }

  _formatTime(totalSec) {
    const sec = Math.floor(totalSec || 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  _formatHoursMinutesSeconds(totalSec) {
    const sec = Math.floor(totalSec || 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new DeskMonitorApp();
  app.init();
});
