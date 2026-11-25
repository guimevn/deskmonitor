import { CONFIG } from './config.js';
import { sound } from './audio.js';

export class HydrationTracker {
  constructor(onHydratedCallback) {
    this.onHydrated = onHydratedCallback;
    this.glasses = 0;
    this.totalMl = 0;
    this.goalMl = CONFIG.HYDRATION.DAILY_GOAL_ML;

    this.gestureActive = false;
    this.gestureStartTime = null;
    this.drinkRegisteredForGesture = false;
    this.lastDrinkTime = 0;
    this.lostTrackingTime = null;
    this.isNearMouth = false;
    this.activeWrist = null;
    this.currentDist = 999;
    this.holdDurationSec = 0;
  }

  process(landmarks, shoulderWidth) {
    if (!landmarks || landmarks.length < 17 || !shoulderWidth) {
      this._resetGesture();
      return { isNearMouth: false, glasses: this.glasses, totalMl: this.totalMl, currentDist: 999, holdDurationSec: 0 };
    }

    const now = performance.now();
    const nose = landmarks[0];
    const leftMouth = landmarks[9] || nose;
    const rightMouth = landmarks[10] || nose;
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;

    const mouth = {
      x: (leftMouth.x + rightMouth.x) / 2,
      y: (leftMouth.y + rightMouth.y) / 2
    };

    const conf = 0.35;
    const isVisible = (p) => p && (p.visibility === undefined || p.visibility > conf);

    const leftHandPoints = [landmarks[15], landmarks[17], landmarks[19], landmarks[21]].filter(isVisible);
    const rightHandPoints = [landmarks[16], landmarks[18], landmarks[20], landmarks[22]].filter(isVisible);

    let distLeft = 999;
    let minLeftY = 999;
    for (const pt of leftHandPoints) {
      const d = Math.hypot(pt.x - mouth.x, pt.y - mouth.y) / shoulderWidth;
      if (d < distLeft) distLeft = d;
      if (pt.y < minLeftY) minLeftY = pt.y;
    }

    let distRight = 999;
    let minRightY = 999;
    for (const pt of rightHandPoints) {
      const d = Math.hypot(pt.x - mouth.x, pt.y - mouth.y) / shoulderWidth;
      if (d < distRight) distRight = d;
      if (pt.y < minRightY) minRightY = pt.y;
    }

    const minDist = Math.min(distLeft, distRight);
    const nearThreshold = CONFIG.HYDRATION.DISTANCE_THRESHOLD;

    const activeHandY = distLeft < distRight ? minLeftY : minRightY;
    const isHandElevated = activeHandY < (midShoulderY + 0.15);

    const timeSinceLastDrink = (now - this.lastDrinkTime) / 1000;
    const inCooldown = timeSinceLastDrink < CONFIG.HYDRATION.COOLDOWN_SEC;

    this.currentDist = minDist;
    const isCurrentlyNear = minDist < nearThreshold && isHandElevated;

    if (isCurrentlyNear) {
      this.isNearMouth = true;
      this.lostTrackingTime = null;
      this.activeWrist = distLeft < distRight ? 'left' : 'right';

      if (!this.gestureActive && !inCooldown) {
        this.gestureActive = true;
        this.gestureStartTime = now;
        this.drinkRegisteredForGesture = false;
      }

      if (this.gestureStartTime) {
        this.holdDurationSec = (now - this.gestureStartTime) / 1000;

        if (
          this.holdDurationSec >= CONFIG.HYDRATION.MIN_HOLD_SEC &&
          !this.drinkRegisteredForGesture
        ) {
          this.drinkRegisteredForGesture = true;
          this._registerDrink(now);
        }
      }
    } else {
      if (this.gestureActive && !this.lostTrackingTime) {
        this.lostTrackingTime = now;
      }

      const isLostForLong = this.lostTrackingTime && (now - this.lostTrackingTime) > 600;

      if (isLostForLong || !this.gestureActive) {
        this.isNearMouth = false;
        this._resetGesture();
      }
    }

    return {
      isNearMouth: this.isNearMouth,
      activeWrist: this.activeWrist,
      glasses: this.glasses,
      totalMl: this.totalMl,
      inCooldown,
      currentDist: this.currentDist,
      holdDurationSec: this.holdDurationSec,
      isRegistered: this.drinkRegisteredForGesture
    };
  }

  _registerDrink(now) {
    this.glasses += 1;
    this.totalMl = this.glasses * CONFIG.HYDRATION.GLASS_ML;
    this.lastDrinkTime = now;
    sound.notifyHydration();

    if (this.onHydrated) {
      this.onHydrated({
        glasses: this.glasses,
        totalMl: this.totalMl,
        addedMl: CONFIG.HYDRATION.GLASS_ML,
        auto: true
      });
    }
  }

  _resetGesture() {
    this.gestureActive = false;
    this.gestureStartTime = null;
    this.drinkRegisteredForGesture = false;
    this.lostTrackingTime = null;
    this.activeWrist = null;
    this.holdDurationSec = 0;
  }

  addManualGlass() {
    this.glasses += 1;
    this.totalMl = this.glasses * CONFIG.HYDRATION.GLASS_ML;
    sound.notifyHydration();
    if (this.onHydrated) {
      this.onHydrated({
        glasses: this.glasses,
        totalMl: this.totalMl,
        addedMl: CONFIG.HYDRATION.GLASS_ML,
        auto: false
      });
    }
  }

  removeManualGlass() {
    if (this.glasses > 0) {
      this.glasses -= 1;
      this.totalMl = this.glasses * CONFIG.HYDRATION.GLASS_ML;
      if (this.onHydrated) {
        this.onHydrated({
          glasses: this.glasses,
          totalMl: this.totalMl,
          addedMl: -CONFIG.HYDRATION.GLASS_ML,
          auto: false
        });
      }
    }
  }
}

export class DoomscrollDetector {
  constructor(onDoomscrollAlertCallback) {
    this.onAlert = onDoomscrollAlertCallback;
    this.isLookingDown = false;
    this.isAlerting = false;
    this.lookDownStartTime = null;
    this.recoveryStartTime = null;
    this.durationSec = 0;
  }

  process(landmarks, shoulderWidth) {
    if (!landmarks || landmarks.length < 9 || !shoulderWidth) {
      this.isLookingDown = false;
      this.lookDownStartTime = null;
      return { isDoomscrolling: false, durationSec: 0 };
    }

    const now = performance.now();
    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];

    const earMidY = (leftEar.y + rightEar.y) / 2;
    const headPitch = (nose.y - earMidY) / shoulderWidth;
    const isDown = headPitch > CONFIG.DOOMSCROLL.PITCH_THRESHOLD;

    this.isLookingDown = isDown;

    if (isDown) {
      this.recoveryStartTime = null;
      if (!this.lookDownStartTime) {
        this.lookDownStartTime = now;
      }

      this.durationSec = (now - this.lookDownStartTime) / 1000;

      if (this.durationSec >= CONFIG.DOOMSCROLL.ALERT_DELAY_SEC) {
        if (!this.isAlerting) {
          this.isAlerting = true;
          sound.notifyDoomscroll();
          if (this.onAlert) {
            this.onAlert({ durationSec: this.durationSec });
          }
        }
      }
    } else {
      if (this.isAlerting || this.lookDownStartTime) {
        if (!this.recoveryStartTime) {
          this.recoveryStartTime = now;
        }
        const recoveryDuration = (now - this.recoveryStartTime) / 1000;
        if (recoveryDuration >= CONFIG.DOOMSCROLL.RECOVERY_DELAY_SEC) {
          this.isAlerting = false;
          this.lookDownStartTime = null;
          this.recoveryStartTime = null;
          this.durationSec = 0;
        }
      } else {
        this.durationSec = 0;
      }
    }

    return {
      isLookingDown: this.isLookingDown,
      isDoomscrolling: this.isAlerting,
      durationSec: this.durationSec
    };
  }
}

export class FocusManager {
  constructor(onStateChangeCallback) {
    this.onStateChange = onStateChangeCallback;
    this.isActive = true;
    this.isAutoPaused = false;
    this.focusedSeconds = 0;
    this.absentDurationSec = 0;
    this.absentStartTime = null;
    this.returnStartTime = null;
    this.lastTick = performance.now();
  }

  process(isPresent) {
    const now = performance.now();
    const deltaSec = (now - this.lastTick) / 1000;
    this.lastTick = now;

    if (deltaSec <= 0 || deltaSec > 2.0) return this.getState();

    if (!isPresent) {
      this.returnStartTime = null;
      if (!this.absentStartTime) {
        this.absentStartTime = now;
      }

      this.absentDurationSec = (now - this.absentStartTime) / 1000;

      if (
        this.absentDurationSec >= CONFIG.FOCUS.PRESENCE_TIMEOUT_SEC &&
        !this.isAutoPaused &&
        this.isActive
      ) {
        this.isAutoPaused = true;
        if (this.onStateChange) {
          this.onStateChange('AUTO_PAUSED', { absentSec: this.absentDurationSec });
        }
      }
    } else {
      this.absentStartTime = null;
      this.absentDurationSec = 0;

      if (this.isAutoPaused) {
        if (!this.returnStartTime) {
          this.returnStartTime = now;
        }
        const returnSec = (now - this.returnStartTime) / 1000;
        if (returnSec >= CONFIG.FOCUS.RECOVERY_PRESENCE_SEC) {
          this.isAutoPaused = false;
          this.returnStartTime = null;
          if (this.onStateChange) {
            this.onStateChange('RESUMED', { focusedSeconds: this.focusedSeconds });
          }
        }
      } else if (this.isActive) {
        this.focusedSeconds += deltaSec;
      }
    }

    return this.getState();
  }

  toggleActive() {
    this.isActive = !this.isActive;
    return this.getState();
  }

  reset() {
    this.focusedSeconds = 0;
    this.absentDurationSec = 0;
    this.absentStartTime = null;
    this.returnStartTime = null;
    return this.getState();
  }

  getState() {
    return {
      isActive: this.isActive,
      isAutoPaused: this.isAutoPaused,
      focusedSeconds: Math.floor(this.focusedSeconds),
      absentDurationSec: Math.floor(this.absentDurationSec)
    };
  }
}
