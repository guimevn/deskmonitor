/**
 * Configurações globais e limiares do DeskMonitor
 */
export const CONFIG = {
  // Taxa de amostragem para inferência do MediaPipe (em milissegundos)
  // ~300ms equivale a ~3.3 frames por segundo, suficiente para ergonomia com CPU mínima (<4%).
  SAMPLE_INTERVAL_MS: 300,

  // Duração da janela de calibração em segundos
  CALIBRATION_DURATION_SEC: 3.0,

  // Tolerâncias temporais (Debounce)
  DEVIANCE_ALERT_DELAY_SEC: 8.0,   // Tempo sustentado fora de postura antes de emitir alerta
  RECOVERY_DELAY_SEC: 2.0,         // Tempo em boa postura para confirmar recuperação

  // Tolerâncias relativas para detecção de desvio (após calibração)
  // Slouching: queda na distância vertical normalizada nariz-ombros
  SLOUCH_TOLERANCE_RATIO: 0.82,    // Margem ergonômica de 18% abaixo da referência calibrada

  // Nerd Neck (Forward Head): avanço do nariz em relação aos ombros no eixo Z
  FORWARD_HEAD_Z_TOLERANCE: 0.080,

  // Desnivelamento dos ombros em relação à referência calibrada (em graus)
  SHOULDER_TILT_TOLERANCE_DEG: 7.0,

  // Fator de suavização do filtro passa-baixa (EMA: 0 = congelado, 1 = sem filtro)
  SMOOTHING_ALPHA: 0.35,

  // Confiança mínima dos landmarks para considerar usuário presente
  VISIBILITY_CONFIDENCE_THRESHOLD: 0.50,

  // --- Fase 2: Hábitos Inteligentes ---
  // Hidratação (Auto-Hydration)
  HYDRATION: {
    DISTANCE_THRESHOLD: 0.72,   // Margem ampliada para garrafas de 500ml/1L, Hydroflask e copos longos
    MIN_HOLD_SEC: 1.2,          // Tempo sustentado para diferenciar gole real de toques rápidos no rosto
    MAX_HOLD_SEC: 10.0,         // Tempo máximo de ingestão contínua
    MAX_HAND_ABOVE_NOSE: 0.04,  // Ignora mão acima do nariz (óculos, testa, cabelo)
    MAX_HORIZONTAL_OFFSET: 0.65,// Alinhamento horizontal da mão em relação à boca (ignora orelha/lateral)
    GLASS_ML: 250,              // Volume por copo em ml
    DAILY_GOAL_ML: 2000         // Meta diária padrão em ml
  },

  // Anti-Doomscrolling (Cabeça voltada para baixo / celular)
  DOOMSCROLL: {
    PITCH_THRESHOLD: 0.38,      // Deslocamento vertical relativo nariz-orelhas
    ALERT_DELAY_SEC: 15.0,      // Tempo sustentado olhando para baixo antes de alertar
    RECOVERY_DELAY_SEC: 2.0
  },

  // Temporizador de Foco & Presença
  FOCUS: {
    PRESENCE_TIMEOUT_SEC: 30.0, // Tempo de cadeira vazia para auto-pausar foco
    RECOVERY_PRESENCE_SEC: 2.0  // Tempo de assento retomado para auto-despausar
  },

  // Modos de visualização
  VIEW_MODES: {
    GHOST: 'ghost',     // Vídeo suavizado com wireframe vetorial sakura
    VIDEO: 'video',     // Vídeo direto com overlay dos pontos
    STEALTH: 'stealth'  // Sem vídeo (fundo escuro plum) apenas wireframe e telemetria
  },

  // Paleta de cores do wireframe (Harmonia Sakura / Cherry Blossom)
  COLORS: {
    GOOD: '#4ade80',      // Matcha / Emerald suave
    WARNING: '#fbbf24',   // Âmbar dourado
    ALERT: '#fb7185',     // Rosa carmesim vibrante
    INACTIVE: '#c49aa6',  // Rosa acinzentado
    ACCENT: '#f47292',    // Sakura pink
    GRID: 'rgba(244, 114, 146, 0.14)'
  }
};
