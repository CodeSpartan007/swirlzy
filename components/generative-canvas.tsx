'use client';

import { useEffect, useRef, useState } from 'react';
import ShaderCanvas from '@/components/generative-shader';
import {
  detectDeviceCapabilities,
  type QualityLevel,
  type DeviceCapabilities,
  PerformanceMonitor,
  type QualitySettings,
  getQualitySettings,
} from '@/lib/device-detection';

export default function GenerativeCanvas() {
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [waveIntensity, setWaveIntensity] = useState(1);
  const [colorPalette, setColorPalette] = useState(0);
  const [showUI, setShowUI] = useState(true);
  const [hasWebGL, setHasWebGL] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [qualityLevel, setQualityLevel] = useState<QualityLevel>('high');
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

  useEffect(() => {
    // Detect device capabilities and initialize performance monitoring
    try {
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
        err instanceof Error ? err.message : 'Unknown WebGL error'
      );
    }

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

    const monitoringInterval = setInterval(() => {
      const { fps, shouldAdjustQuality, newQuality } =
        performanceMonitorRef.current!.update();

      setFps(Math.round(fps));

      if (shouldAdjustQuality && newQuality) {
        setQualityLevel(newQuality);
        setQualitySettings(getQualitySettings(newQuality));
      }
    }, 1000);

    return () => clearInterval(monitoringInterval);
  }, []);

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
            <div className="mt-4 text-gray-500 border-t border-white/10 pt-2">
              <div className="text-yellow-400">Device: {deviceCapabilities?.deviceType}</div>
              <div className="text-green-400">Quality: {qualityLevel}</div>
              <div className="text-blue-400">FPS: {fps}</div>
              <div className="mt-2 text-gray-500 text-xs">Move mouse to interact</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
