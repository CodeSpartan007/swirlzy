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
  private readonly fpsThresholdHighToMedium = 50; // Downgrade from high to medium when below 50 FPS
  private readonly fpsThresholdMediumToLow = 30; // Downgrade from medium to low when below 30 FPS
  private readonly fpsThresholdMediumToHigh = 60; // Upgrade from medium to high when above 60 FPS
  private readonly fpsThresholdLowToMedium = 40; // Upgrade from low to medium when above 40 FPS
  private qualityLevel: QualityLevel;
  private lastQualityAdjustmentTime = 0;
  private readonly qualityAdjustmentCooldown = 4000; // Wait 4 seconds before adjusting again
  private lowPerformanceSamples = 0; // Count how many times FPS was below threshold
  private readonly lowPerformanceThresholdForMedium = 3; // Need 3 samples below 50 to downgrade to medium
  private readonly lowPerformanceThresholdForLow = 4; // Need 4 samples below 30 to downgrade to low (very conservative)

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

    // Quality-specific logic to avoid aggressive downgrading
    if (this.qualityLevel === 'high') {
      // Only downgrade from high to medium if FPS consistently below 50
      if (currentFps < this.fpsThresholdHighToMedium) {
        this.lowPerformanceSamples++;
      } else {
        this.lowPerformanceSamples = 0;
      }

      if (
        this.lowPerformanceSamples >= this.lowPerformanceThresholdForMedium &&
        averageFpsOverTime < this.fpsThresholdHighToMedium
      ) {
        this.qualityLevel = 'medium';
        return {
          fps: currentFps,
          shouldAdjustQuality: true,
          newQuality: 'medium',
        };
      }
    } else if (this.qualityLevel === 'medium') {
      // Medium: can go to high if FPS is consistently above 60
      if (currentFps > this.fpsThresholdMediumToHigh) {
        this.lowPerformanceSamples++;
      } else {
        this.lowPerformanceSamples = 0;
      }

      if (
        this.lowPerformanceSamples >= 2 &&
        averageFpsOverTime > this.fpsThresholdMediumToHigh
      ) {
        this.qualityLevel = 'high';
        return {
          fps: currentFps,
          shouldAdjustQuality: true,
          newQuality: 'high',
        };
      }

      // Medium to Low: only if FPS is VERY consistently below 30
      if (currentFps < this.fpsThresholdMediumToLow) {
        this.lowPerformanceSamples++;
      } else if (currentFps < this.fpsThresholdHighToMedium) {
        // Keep counter going if between 30-50 but below medium-to-high threshold
        this.lowPerformanceSamples = Math.max(0, this.lowPerformanceSamples - 1);
      } else {
        this.lowPerformanceSamples = 0;
      }

      if (
        this.lowPerformanceSamples >= this.lowPerformanceThresholdForLow &&
        averageFpsOverTime < this.fpsThresholdMediumToLow
      ) {
        this.qualityLevel = 'low';
        return {
          fps: currentFps,
          shouldAdjustQuality: true,
          newQuality: 'low',
        };
      }
    } else if (this.qualityLevel === 'low') {
      // Low: upgrade to medium if FPS is consistently above 40
      if (currentFps > this.fpsThresholdLowToMedium) {
        this.lowPerformanceSamples++;
      } else {
        this.lowPerformanceSamples = 0;
      }

      if (
        this.lowPerformanceSamples >= 2 &&
        averageFpsOverTime > this.fpsThresholdLowToMedium
      ) {
        this.qualityLevel = 'medium';
        return {
          fps: currentFps,
          shouldAdjustQuality: true,
          newQuality: 'medium',
        };
      }
    }

    return { fps: currentFps, shouldAdjustQuality: false };
  }

  getQualityLevel(): QualityLevel {
    return this.qualityLevel;
  }
}
