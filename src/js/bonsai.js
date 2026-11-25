/**
 * Desk Sakura Bonsai — Companheiro de mesa virtual (Fase 3: Gamificação Positiva)
 * Arte vetorial zen minimalista em SVG procedural (100% sem emojis).
 */

export const BonsaiState = {
  BLOOMING: 'BLOOMING',   // Postura excelente (>=85%) e hidratado
  NEUTRAL: 'NEUTRAL',     // Postura regular
  WITHERING: 'WITHERING'  // Postura ruim sustentada (<60%) ou alerta ativo
};

export class DeskBonsai {
  constructor(containerElement, onLevelUpCallback) {
    this.container = containerElement;
    this.onLevelUp = onLevelUpCallback;

    const saved = this._loadState();
    this.xp = saved.xp || 0;
    this.level = saved.level || 1;
    this.streakMinutes = saved.streakMinutes || 0;
    this.health = 100;
    this.state = BonsaiState.NEUTRAL;

    this.lastXpTick = performance.now();
  }

  _loadState() {
    try {
      const data = localStorage.getItem('deskmonitor_bonsai_v1');
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  saveState() {
    try {
      localStorage.setItem('deskmonitor_bonsai_v1', JSON.stringify({
        xp: this.xp,
        level: this.level,
        streakMinutes: this.streakMinutes,
        lastSavedDate: new Date().toISOString().split('T')[0]
      }));
    } catch (e) {
      console.warn('[DeskMonitor] Falha ao salvar bonsai no localStorage:', e);
    }
  }

  update(postureScore, isAlerting, waterGlasses, focusedMinutes) {
    const now = performance.now();

    if (isAlerting || postureScore < 60) {
      this.state = BonsaiState.WITHERING;
      this.health = Math.max(15, this.health - 0.2);
    } else if (postureScore >= 85 && waterGlasses >= 1) {
      this.state = BonsaiState.BLOOMING;
      this.health = Math.min(100, this.health + 0.15);
    } else {
      this.state = BonsaiState.NEUTRAL;
      this.health = Math.max(50, Math.min(85, this.health));
    }

    if ((now - this.lastXpTick) >= 60000) {
      this.lastXpTick = now;
      if (postureScore >= 70 && !isAlerting) {
        this.addXp(15);
        this.streakMinutes += 1;
      } else {
        this.streakMinutes = 0;
      }
      this.saveState();
    }

    this.render();
  }

  addXp(amount) {
    this.xp += amount;
    const requiredXp = this.level * 100;
    while (this.xp >= this.level * 100) {
      this.xp -= this.level * 100;
      this.level += 1;
      if (this.onLevelUp) {
        this.onLevelUp(this.level);
      }
    }
    this.saveState();
    this.render();
  }

  render() {
    if (!this.container) return;

    let canopyMain = '#f48fb1';     // Sakura suave
    let canopyHighlight = '#fbcfe8';
    let trunkColor = '#4a1c24';     // Madeira escura cerejeira
    let barColor = '#e1375b';
    let stateLabel = 'EM EQUILIBRIO';
    let stateClass = 'text-[#9d2b46] bg-[#fce7ec] border-[#f3b8c6]';

    if (this.state === BonsaiState.BLOOMING) {
      canopyMain = '#ec4873';       // Sakura vibrante em flor
      canopyHighlight = '#fda4af';
      barColor = '#237a57';
      stateLabel = 'FLORESCENDO';
      stateClass = 'text-[#1b5e43] bg-[#e6f6ef] border-[#a7dfc7]';
    } else if (this.state === BonsaiState.WITHERING) {
      canopyMain = '#d49a6a';       // Folhagem outonal / murchando
      canopyHighlight = '#e8c4a2';
      trunkColor = '#5c4b47';
      barColor = '#c47316';
      stateLabel = 'PRECISA DE CUIDADO';
      stateClass = 'text-[#9a550c] bg-[#fef3e2] border-[#f3cfa0]';
    }

    const requiredXp = this.level * 100;
    const xpPercent = Math.min(100, Math.round((this.xp / requiredXp) * 100));

    const blossoms = this.state === BonsaiState.BLOOMING
      ? `
        <circle cx="54" cy="40" r="2.6" fill="#fff5f7" />
        <circle cx="54" cy="40" r="1.1" fill="#e1375b" />
        <circle cx="92" cy="30" r="2.8" fill="#fff5f7" />
        <circle cx="92" cy="30" r="1.2" fill="#e1375b" />
        <circle cx="116" cy="46" r="2.4" fill="#fff5f7" />
        <circle cx="116" cy="46" r="1.0" fill="#e1375b" />
        <circle cx="76" cy="20" r="3.0" fill="#fff5f7" />
        <circle cx="76" cy="20" r="1.3" fill="#e1375b" />
        <ellipse cx="34" cy="72" rx="3" ry="1.6" fill="#f47292" transform="rotate(-25 34 72)" opacity="0.85" />
        <ellipse cx="132" cy="68" rx="2.6" ry="1.4" fill="#f47292" transform="rotate(30 132 68)" opacity="0.8" />
      `
      : `
        <circle cx="78" cy="24" r="2.0" fill="#fff5f7" opacity="0.85" />
        <circle cx="56" cy="44" r="1.8" fill="#fff5f7" opacity="0.75" />
      `;

    this.container.innerHTML = `
      <div class="flex items-center gap-3 w-full">
        <!-- SVG Procedural do Sakura Bonsai -->
        <div class="relative w-24 h-20 flex-shrink-0 flex items-center justify-center bg-[#fff5f7] rounded-lg border border-[#f2cfd8] p-1">
          <svg viewBox="0 0 160 120" class="w-full h-full">
            <!-- Halo solar suave ao fundo -->
            <circle cx="80" cy="54" r="38" fill="#fce1e8" opacity="0.7" />

            <!-- Vaso Cerâmico Japonês -->
            <path d="M 42 100 L 118 100 L 111 113 L 49 113 Z" fill="#2c191e" stroke="#4a2630" stroke-width="1.5" />
            <line x1="38" y1="100" x2="122" y2="100" stroke="#5c2d39" stroke-width="2.2" stroke-linecap="round" />

            <!-- Tronco e Galhos Esculpidos -->
            <path d="M 80 100 Q 82 80 72 68 Q 64 58 76 46 Q 84 36 82 26" fill="none" stroke="${trunkColor}" stroke-width="6" stroke-linecap="round" />
            <path d="M 72 68 Q 56 63 52 50" fill="none" stroke="${trunkColor}" stroke-width="3.5" stroke-linecap="round" />
            <path d="M 76 46 Q 98 44 108 53" fill="none" stroke="${trunkColor}" stroke-width="3" stroke-linecap="round" />

            <!-- Copa Sakura (Nuvens de Cerejeira) -->
            <ellipse cx="50" cy="46" rx="18" ry="11" fill="${canopyMain}" opacity="0.95" />
            <ellipse cx="56" cy="40" rx="13" ry="8" fill="${canopyHighlight}" opacity="0.85" />

            <ellipse cx="112" cy="50" rx="19" ry="11" fill="${canopyMain}" opacity="0.95" />
            <ellipse cx="106" cy="43" rx="14" ry="8" fill="${canopyHighlight}" opacity="0.85" />

            <ellipse cx="80" cy="24" rx="24" ry="14" fill="${canopyMain}" opacity="0.98" />
            <ellipse cx="86" cy="18" rx="17" ry="9" fill="${canopyHighlight}" opacity="0.85" />

            ${blossoms}
          </svg>
        </div>

        <!-- Estatísticas do Sakura Bonsai -->
        <div class="flex-1 min-w-0 flex flex-col gap-1.5">
          <div class="flex items-center justify-between gap-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs font-bold text-[#24171a] truncate">Sakura Nv. ${this.level}</span>
              <span class="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-full border ${stateClass} whitespace-nowrap">
                ${stateLabel}
              </span>
            </div>
            <span class="text-[11px] font-mono font-bold text-[#5c3a43] flex-shrink-0">${this.health.toFixed(0)}%</span>
          </div>

          <!-- Barra de Vitalidade -->
          <div class="w-full bg-[#f8e1e7] h-1.5 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500" style="width: ${this.health}%; background-color: ${barColor};"></div>
          </div>

          <!-- XP e Streak -->
          <div class="flex items-center justify-between text-[10px] font-mono text-[#6e4f56] pt-0.5">
            <span>XP ${this.xp}/${requiredXp} (${xpPercent}%)</span>
            <span>Streak: <strong class="text-[#e1375b]">${this.streakMinutes}m</strong></span>
          </div>
        </div>
      </div>
    `;
  }
}
