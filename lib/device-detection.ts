export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type QualityLevel = 'high' | 'medium' | 'low';

export interface DeviceCapabilities {
  deviceType: DeviceType;
  hasWebGL2: boolean;
  gpuTier: 'high' | 'medium' | 'low';
  initialQualityLevel: QualityLevel;
  maxFPS: number;
  pixelRatio: number;
}

export interface QualitySettings {
  fbmOctaves: number;
  shaderComplexity: number;
  animationIntensity: number;
  pixelRatio: number;
  maxFPS: number;
  enableMouseDistortion: boolean;
  enableClickEffect: boolean;
  colorLayers: number;
}

const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  high: {
    fbmOctaves: 6,
    shaderComplexity: 1.0,
    animationIntensity: 1.0,
    pixelRatio: window.devicePixelRatio || 1,
    maxFPS: 60,
    enableMouseDistortion: true,
    enableClickEffect: true,
    colorLayers: 6,
  },
  medium: {
    fbmOctaves: 4,
    shaderComplexity: 0.7,
    animationIntensity: 0.85,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    maxFPS: 60,
    enableMouseDistortion: true,
    enableClickEffect: true,
    colorLayers: 4,
  },
  low: {
    fbmOctaves: 2,
    shaderComplexity: 0.4,
    animationIntensity: 0.6,
    pixelRatio: 1,
    maxFPS: 30,
    enableMouseDistortion: false,
    enableClickEffect: true,
    colorLayers: 2,
  },
};

export function detectDeviceCapabilities(): DeviceCapabilities {
  // Detect device type
  const userAgent = navigator.userAgent.toLowerCase();
  let deviceType: DeviceType = 'desktop';
  
  if (/mobile|android|iphone|ipod/.test(userAgent)) {
    deviceType = 'mobile';
  } else if (/ipad|tablet|playbook|silk/.test(userAgent)) {
    deviceType = 'tablet';
  }

  // Detect WebGL2 support
  const canvas = document.createElement('canvas');
  const hasWebGL2 = !!(
    window.WebGL2RenderingContext &&
    canvas.getContext('webgl2')
  );

  // Detect GPU tier based on device type and available hardware
  let gpuTier: 'high' | 'medium' | 'low' = 'medium';
  
  if (deviceType === 'mobile') {
    gpuTier = 'low';
  } else if (deviceType === 'desktop' && hasWebGL2) {
    gpuTier = 'high';
  }

  // Determine initial quality level
  let initialQualityLevel: QualityLevel = 'high';
  if (gpuTier === 'low') {
    initialQualityLevel = 'low';
  } else if (gpuTier === 'medium') {
    initialQualityLevel = 'medium';
  }

  return {
    deviceType,
    hasWebGL2,
    gpuTier,
    initialQualityLevel,
    maxFPS: initialQualityLevel === 'low' ? 30 : 60,
    pixelRatio:
      initialQualityLevel === 'low'
        ? 1
        : Math.min(window.devicePixelRatio || 1, 2),
  };
}

export function getQualitySettings(level: QualityLevel): QualitySettings {
  return QUALITY_PRESETS[level];
}

export class PerformanceMonitor {
  private lastFrameTime = performance.now();
  private frameTimes: number[] = [];
  private readonly frameHistorySize = 60; // ~1 second of frames
  private fpsReadings: number[] = []; // Long-term FPS history for quality decisions
  private readonly fpsReadingHistorySize = 6; // ~3 seconds (6 readings × 500ms)
  private averageFps = 60;
  private lastReportTime = performance.now();
  private readonly reportInterval = 500; // Update FPS display every 500ms
  private fpsThreshold = 50;
  private qualityLevel: QualityLevel;
  private lastQualityAdjustmentTime = 0;
  private readonly qualityAdjustmentCooldown = 4000; // Wait 4 seconds before adjusting again
  private lowPerformanceSamples = 0; // Count how many times FPS was below threshold
  private readonly lowPerformanceThreshold = 3; // Need 3 consecutive low samples to downgrade

  constructor(initialQuality: QualityLevel) {
    this.qualityLevel = initialQuality;
  }

  /**
   * Call this from requestAnimationFrame to track frame timing
   */
  recordFrame(): void {
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    
    // Only record if deltaTime is reasonable (> 0)
    if (deltaTime > 0) {
      this.frameTimes.push(deltaTime);
      
      // Keep only the last N frame times for rolling average
      if (this.frameTimes.length > this.frameHistorySize) {
        this.frameTimes.shift();
      }
    }
    
    this.lastFrameTime = now;
  }

  /**
   * Call periodically (e.g., every 500ms) to get FPS and check quality adjustment
   * Returns the current FPS and whether quality should be adjusted
   */
  update(): { fps: number; shouldAdjustQuality: boolean; newQuality?: QualityLevel } {
    const now = performance.now();
    
    // Only update FPS display at the report interval
    if (now - this.lastReportTime >= this.reportInterval) {
      this.averageFps = this.calculateAverageFps();
      this.fpsReadings.push(this.averageFps);
      
      // Keep only the last N FPS readings (3+ seconds of data)
      if (this.fpsReadings.length > this.fpsReadingHistorySize) {
        this.fpsReadings.shift();
      }
      
      this.lastReportTime = now;
      
      // Check if we should adjust quality (with cooldown)
      if (now - this.lastQualityAdjustmentTime >= this.qualityAdjustmentCooldown) {
        const qualityAdjustment = this.analyzePerformance();
        if (qualityAdjustment.shouldAdjustQuality) {
          this.lastQualityAdjustmentTime = now;
          // Reset low performance counter after quality adjustment
          this.lowPerformanceSamples = 0;
        }
        return qualityAdjustment;
      }
    }

    return { fps: this.averageFps, shouldAdjustQuality: false };
  }

  /**
   * Calculate average FPS from frame times using rolling average
   */
  private calculateAverageFps(): number {
    if (this.frameTimes.length === 0) {
      return 60;
    }

    // Calculate average delta time
    const averageDeltaTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    
    // FPS = 1000 / averageDeltaTime (in milliseconds)
    return Math.round(1000 / averageDeltaTime);
  }

  /**
   * Get average FPS over the long-term history (2-3 seconds)
   */
  private getAverageFpsOverTime(): number {
    if (this.fpsReadings.length === 0) {
      return this.averageFps;
    }
    return Math.round(
      this.fpsReadings.reduce((a, b) => a + b, 0) / this.fpsReadings.length
    );
  }

  private analyzePerformance(): {
    fps: number;
    shouldAdjustQuality: boolean;
    newQuality?: QualityLevel;
  } {
    // Need enough readings to make a decision (at least 2 seconds of data)
    if (this.fpsReadings.length < 3) {
      return { fps: this.averageFps, shouldAdjustQuality: false };
    }

    const averageFpsOverTime = this.getAverageFpsOverTime();
    const currentFps = this.averageFps;

    // Track consecutive low FPS samples for aggressive downgrade prevention
    if (currentFps < this.fpsThreshold) {
      this.lowPerformanceSamples++;
    } else {
      // Reset counter if performance improves
      this.lowPerformanceSamples = 0;
    }

    // Only downgrade if FPS has been consistently low
    if (
      this.lowPerformanceSamples >= this.lowPerformanceThreshold &&
      averageFpsOverTime < this.fpsThreshold &&
      this.qualityLevel !== 'low'
    ) {
      const newQuality = this.qualityLevel === 'high' ? 'medium' : 'low';
      this.qualityLevel = newQuality;
      return {
        fps: currentFps,
        shouldAdjustQuality: true,
        newQuality,
      };
    }

    // Upgrade only if performance is consistently good (higher threshold for upgrade)
    if (
      averageFpsOverTime > this.fpsThreshold + 20 &&
      this.qualityLevel !== 'high'
    ) {
      const newQuality = this.qualityLevel === 'low' ? 'medium' : 'high';
      this.qualityLevel = newQuality;
      return {
        fps: currentFps,
        shouldAdjustQuality: true,
        newQuality,
      };
    }

    return { fps: currentFps, shouldAdjustQuality: false };
  }

  getQualityLevel(): QualityLevel {
    return this.qualityLevel;
  }

  setFpsThreshold(threshold: number): void {
    this.fpsThreshold = threshold;
  }
}
