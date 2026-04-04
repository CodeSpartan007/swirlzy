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
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 60;
  private fpsHistory: number[] = [];
  private readonly historySize = 30;
  private fpsThreshold = 50;
  private qualityLevel: QualityLevel;

  constructor(initialQuality: QualityLevel) {
    this.qualityLevel = initialQuality;
  }

  update(): { fps: number; shouldAdjustQuality: boolean; newQuality?: QualityLevel } {
    this.frameCount++;
    const now = performance.now();
    const deltaTime = now - this.lastTime;

    if (deltaTime >= 1000) {
      this.fps = (this.frameCount * 1000) / deltaTime;
      this.fpsHistory.push(this.fps);

      if (this.fpsHistory.length > this.historySize) {
        this.fpsHistory.shift();
      }

      this.frameCount = 0;
      this.lastTime = now;

      return this.analyzePerformance();
    }

    return { fps: this.fps, shouldAdjustQuality: false };
  }

  private analyzePerformance(): {
    fps: number;
    shouldAdjustQuality: boolean;
    newQuality?: QualityLevel;
  } {
    if (this.fpsHistory.length < 5) {
      return { fps: this.fps, shouldAdjustQuality: false };
    }

    const recentFPS = this.fpsHistory.slice(-5);
    const avgFPS = recentFPS.reduce((a, b) => a + b) / recentFPS.length;

    // If FPS is consistently low, reduce quality
    if (avgFPS < this.fpsThreshold && this.qualityLevel !== 'low') {
      const newQuality = this.qualityLevel === 'high' ? 'medium' : 'low';
      this.qualityLevel = newQuality;
      return {
        fps: this.fps,
        shouldAdjustQuality: true,
        newQuality,
      };
    }

    // If FPS is good and we're not on high, try to increase quality
    if (avgFPS > this.fpsThreshold + 15 && this.qualityLevel !== 'high') {
      const newQuality = this.qualityLevel === 'low' ? 'medium' : 'high';
      this.qualityLevel = newQuality;
      return {
        fps: this.fps,
        shouldAdjustQuality: true,
        newQuality,
      };
    }

    return { fps: this.fps, shouldAdjustQuality: false };
  }

  getQualityLevel(): QualityLevel {
    return this.qualityLevel;
  }

  setFpsThreshold(threshold: number): void {
    this.fpsThreshold = threshold;
  }
}
