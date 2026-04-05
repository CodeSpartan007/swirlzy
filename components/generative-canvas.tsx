'use client';

import { useEffect, useRef, useState } from 'react';
import ShaderCanvas from '@/components/generative-shader';
import type {
  QualityLevel,
  DeviceCapabilities,
  QualitySettings,
} from '@/lib/device-detection';

export default function GenerativeCanvas() {
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [waveIntensity, setWaveIntensity] = useState(1);
  const [colorPalette, setColorPalette] = useState(0);
  const [blackHoleSize, setBlackHoleSize] = useState(1);
  const [qualityMode, setQualityMode] = useState<QualityLevel | 'auto'>('auto');
  const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities | null>(null);
  const [fps, setFps] = useState(60);
  const [qualitySettings, setQualitySettings] = useState<QualitySettings | null>(null);
  const hideUITimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const performanceMonitorRef = useRef<PerformanceMonitor | null>(null);

  const handleMouseMove = () => {
    setShowUI(true);
    if (hideUITimeoutRef.current) {
      clearTimeout(hideUITimeoutRef.current);
    }
    hideUITimeoutRef.current = setTimeout(() => {
      setShowUI(false);
    }, 3000);
  };

  const handleQualityModeChange = async (mode: QualityLevel | 'auto') => {
    setQualityMode(mode);
    if (performanceMonitorRef.current) {
      performanceMonitorRef.current.setManualQuality(mode);
    }
    if (mode !== 'auto') {
      setQualityLevel(mode);
      try {
        const { getQualitySettings } = await import('@/lib/device-detection');
        setQualitySettings(getQualitySettings(mode));
      } catch (err) {
        console.error('Failed to load quality settings:', err);
      }
    }
  };

  const handleFpsUpdate = (newFps: number) => {
    setFps(newFps);
  };

  useEffect(() => {
    // Dynamically import device detection on client only
    const initializeDeviceDetection = async () => {
      try {
        const { detectDeviceCapabilities, getQualitySettings, PerformanceMonitor } =
          await import('@/lib/device-detection');
        
        const capabilities = detectDeviceCapabilities();
        setDeviceCapabilities(capabilities);
        setQualityLevel(capabilities.initialQualityLevel);
        setQualitySettings(getQualitySettings(capabilities.initialQualityLevel));
        
        performanceMonitorRef.current = new PerformanceMonitor(
          capabilities.initialQualityLevel
        );

        // Check WebGL support
        const canvas = document.createElement('canvas');
        const gl =
          canvas.getContext('webgl') || canvas.getContext('webgl2');
        if (!gl) {
          setHasWebGL(false);
          setWebglError('WebGL not supported in your browser');
        }
      } catch (err) {
        setHasWebGL(false);
        setWebglError(
          err instanceof Error ? err.message : 'Failed to initialize device detection'
        );
      }
    };

    initializeDeviceDetection();

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideUITimeoutRef.current) {
        clearTimeout(hideUITimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPaused((p) => !p);
      }
      if (e.key === 'p' || e.key === 'P') {
        setColorPalette((prev) => prev + 1);
      }
      if (e.key === 'r' || e.key === 'R') {
        setSpeed(Math.random() * 2 + 0.5);
        setWaveIntensity(Math.random() + 0.5);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  useEffect(() => {
    const handleScroll = (e: WheelEvent) => {
      setSpeed((prev) => Math.max(0.1, Math.min(3, prev + e.deltaY * 0.001)));
    };

    window.addEventListener('wheel', handleScroll, { passive: true });
    return () => window.removeEventListener('wheel', handleScroll);
  }, []);

  // Performance monitoring and quality adjustment
  useEffect(() => {
    if (!performanceMonitorRef.current) return;

    const monitoringInterval = setInterval(async () => {
      const { shouldAdjustQuality, newQuality } =
        performanceMonitorRef.current!.update();

      // Only apply auto quality adjustments if in auto mode
      if (qualityMode === 'auto' && shouldAdjustQuality && newQuality) {
        setQualityLevel(newQuality);
        try {
          const { getQualitySettings } = await import('@/lib/device-detection');
          setQualitySettings(getQualitySettings(newQuality));
        } catch (err) {
          console.error('Failed to update quality settings:', err);
        }
      }
    }, 1000);

    return () => clearInterval(monitoringInterval);
  }, [qualityMode]);

  // Fallback UI for WebGL not supported
  if (!hasWebGL) {
    return (
      <div
        className="relative w-full h-screen overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)`,
        }}
      >
        <div className="text-center px-6">
          <h1 className="text-4xl font-bold text-white mb-4">Generative Art</h1>
          <p className="text-gray-300 mb-2">WebGL is not available</p>
          <p className="text-gray-400 text-sm">{webglError}</p>
          <p className="text-gray-500 text-sm mt-4">
            Please use a modern browser with WebGL support
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <ShaderCanvas
        isPaused={isPaused}
        speed={speed}
        waveIntensity={waveIntensity}
        colorPalette={colorPalette}
        qualitySettings={qualitySettings}
        performanceMonitor={performanceMonitorRef.current}
        onFpsUpdate={handleFpsUpdate}
        blackHoleSize={blackHoleSize}
      />

      {/* UI Overlay */}
      <div
        className={`absolute bottom-6 right-6 bg-black/50 backdrop-blur-sm rounded-lg p-4 text-white text-sm transition-opacity duration-300 ${
          showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="space-y-3 font-mono text-xs">
          <button
            onClick={() => setIsPaused((p) => !p)}
            className="block w-full text-left px-2 py-1 hover:bg-white/10 rounded transition-colors"
          >
            {isPaused ? '▶' : '⏸'} Space: {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={() => setColorPalette((prev) => prev + 1)}
            className="block w-full text-left px-2 py-1 hover:bg-white/10 rounded transition-colors"
          >
            🎨 P: Change Palette
          </button>
          <button
            onClick={() => {
              setSpeed(Math.random() * 2 + 0.5);
              setWaveIntensity(Math.random() + 0.5);
            }}
            className="block w-full text-left px-2 py-1 hover:bg-white/10 rounded transition-colors"
          >
            ✨ R: Randomize
          </button>
          <div className="text-gray-400 px-2 pt-2 border-t border-white/10">
            <div>Speed: {speed.toFixed(2)}x</div>
            <div>Wave: {waveIntensity.toFixed(2)}</div>
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Blackhole: {blackHoleSize.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2.5"
                step="0.05"
                value={blackHoleSize}
                onChange={(e) => setBlackHoleSize(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
            <div className="mt-4 text-gray-500 border-t border-white/10 pt-2">
              <div className="text-yellow-400">Device: {deviceCapabilities?.deviceType}</div>
              <div className="text-green-400">Quality: {qualityLevel}</div>
              <div className="text-blue-400">FPS: {fps}</div>
              <div className="mt-3 space-y-2">
                <div className="text-xs font-semibold text-white">Quality Mode:</div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleQualityModeChange('auto')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      qualityMode === 'auto'
                        ? 'bg-blue-500/80 text-white'
                        : 'bg-white/10 text-gray-400 hover:bg-white/20'
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    onClick={() => handleQualityModeChange('high')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      qualityMode === 'high'
                        ? 'bg-green-500/80 text-white'
                        : 'bg-white/10 text-gray-400 hover:bg-white/20'
                    }`}
                  >
                    High
                  </button>
                  <button
                    onClick={() => handleQualityModeChange('medium')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      qualityMode === 'medium'
                        ? 'bg-yellow-500/80 text-white'
                        : 'bg-white/10 text-gray-400 hover:bg-white/20'
                    }`}
                  >
                    Med
                  </button>
                  <button
                    onClick={() => handleQualityModeChange('low')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      qualityMode === 'low'
                        ? 'bg-red-500/80 text-white'
                        : 'bg-white/10 text-gray-400 hover:bg-white/20'
                    }`}
                  >
                    Low
                  </button>
                </div>
              </div>
              <div className="mt-2 text-gray-500 text-xs">Move mouse to interact</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
