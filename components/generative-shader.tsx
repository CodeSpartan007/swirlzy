'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uMouseVelocity;
  uniform float uMouseForce;
  uniform vec2 uClickPos;
  uniform float uClickTime;
  uniform float uSpeed;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  uniform vec3 uColor5;
  uniform vec3 uColor6;
  uniform float uPaletteBlend;
  uniform float uWaveIntensity;
  varying vec2 vUv;
  
  const float PI = 3.141592653589793;
  
  // Simplex noise function
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 x12;
    x12.x = x0.x - 0.0;
    x12.y = x0.y - C.z;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, C.z, 1.0 ) ) + i.x + vec3(0.0, 0.0, 1.0 ) );
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.x,x12.x), dot(x12.y,x12.y)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.w) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xy + h.yz * x12.yy;
    return 130.0 * dot(m, g);
  }
  
  // Layered fractional Brownian motion for complex depth
  float fbm(vec2 pos, float time, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float maxValue = 0.0;
    
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      
      value += amplitude * snoise(pos * frequency + time * 0.05);
      maxValue += amplitude;
      
      // Modulate frequency and phase for more complex patterns (reduced for calm motion)
      frequency *= 2.345;
      amplitude *= 0.5;
      pos *= 1.8 + sin(time * 0.08 + float(i)) * 0.2;
    }
    
    return value / maxValue;
  }
  
  // Vector field-based curl noise for smooth fluid motion
  vec2 curlFlow(vec2 pos, float time) {
    float n1 = fbm(pos, time, 4);
    float n2 = fbm(pos + 5.234, time, 4);
    float n3 = fbm(pos + 10.768, time, 4);
    
    vec2 grad = normalize(vec2(
      fbm(pos + vec2(0.01, 0.0), time, 3) - n1,
      fbm(pos + vec2(0.0, 0.01), time, 3) - n2
    ));
    
    // Create perpendicular flow (curl)
    return vec2(-grad.y, grad.x) * n3;
  }
  
  // Multiple vortices creating fluid dynamics
  vec2 vortexFlow(vec2 pos, vec2 vortexPos, float strength, float time) {
    vec2 delta = pos - vortexPos;
    float r = length(delta);
    
    // Prevent singularity
    r = max(r, 0.1);
    
    // Tangential velocity field (rotation around vortex)
    float angle = atan(delta.y, delta.x);
    vec2 tangent = vec2(-sin(angle), cos(angle));
    
    // Velocity decreases with distance (realistic vortex decay)
    float decay = exp(-r * r * 2.0);
    float circulation = strength * decay / (r + 0.1);
    
    // Add time-based pulsing for dynamics (reduced frequency for calm motion)
    circulation *= (sin(uTime * 0.6 + angle * 1.5) * 0.2 + 0.8);
    
    return tangent * circulation;
  }
  
  // Momentum-driven liquid pushing effect from mouse velocity
  vec2 mouseInertiaFlow(vec2 pos, vec2 mousePos, vec2 mouseVel, float force) {
    vec2 delta = pos - mousePos;
    float r = length(delta);
    
    // Smooth Gaussian falloff for liquid-like pushing
    float falloff = exp(-r * r * 6.0);
    
    // Directional push along velocity vector with smooth decay
    vec2 push = mouseVel * falloff * force;
    
    // Create secondary swirl around the push direction
    float angle = atan(delta.y, delta.x);
    float velAngle = atan(mouseVel.y, mouseVel.x);
    float swirl = sin(angle - velAngle) * 0.5 + 0.5;
    
    // Add perpendicular curl for liquid-like motion
    vec2 perpendicular = vec2(-mouseVel.y, mouseVel.x);
    push += perpendicular * swirl * falloff * force * 0.3;
    
    return push;
  }
  
  // Domain warping to distort and break up geometric patterns
  vec2 domainWarp(vec2 pos, float time) {
    vec2 warpA = vec2(fbm(pos * 0.5, time, 3), fbm(pos * 0.5 + 5.234, time, 3)) * 0.5;
    vec2 warpB = vec2(fbm(pos + warpA, time * 0.8, 2), fbm(pos + warpA + 10.768, time * 0.8, 2)) * 0.3;
    return pos + warpA + warpB;
  }
  
  // Advect particles through flow field
  vec2 advectPosition(vec2 pos, float time) {
    // Primary rotating flow from center (reduced strength)
    vec2 centerVortex = vortexFlow(pos, vec2(0.5, 0.5), 0.8, time);
    
    // Mouse-driven vortex (reduced for soft interaction)
    vec2 mouseVortex = vortexFlow(pos, uMouse, uWaveIntensity * 0.8, time);
    
    // Momentum-driven liquid push from mouse movement (reduced strength)
    vec2 inertiaFlow = mouseInertiaFlow(pos, uMouse, uMouseVelocity, uMouseForce);
    
    // Curl noise for added turbulence (reduced intensity)
    vec2 turbulence = curlFlow(pos * 3.0, time) * 0.2;
    
    // Combine flows with reduced intensities (lava lamp feel)
    vec2 flow = centerVortex * 0.6 + mouseVortex * 0.1 + inertiaFlow * 0.15 + turbulence * 0.05;
    
    // Advect position along flow with reduced step size
    return pos + flow * 0.008;
  }
  
  // Click explosion ripple effect - returns ripple intensity
  float explosionRipple(vec2 pos, vec2 clickPos, float clickAge) {
    // Only show ripple if click is recent (fade out over 1.5 seconds)
    if (clickAge > 1.5) return 0.0;
    
    float dist = distance(pos, clickPos);
    
    // Ripple wave that expands outward
    float waveRadius = clickAge * 0.8;
    float waveWidth = 0.15;
    float ripple = exp(-pow(dist - waveRadius, 2.0) / (waveWidth * waveWidth));
    
    // Add another expanding wave for more energy
    float ripple2 = exp(-pow(dist - waveRadius * 0.6, 2.0) / ((waveWidth * 1.2) * (waveWidth * 1.2)));
    
    // Fade out effect
    float fadeOut = 1.0 - (clickAge / 1.5);
    
    return (ripple + ripple2 * 0.6) * fadeOut;
  }
  
  // Explosion color calculation - creates vibrant color burst
  vec3 explosionColor(vec2 pos, vec2 clickPos, float clickAge) {
    if (clickAge > 1.5) return vec3(0.0);
    
    float dist = distance(pos, clickPos);
    
    // Create expanding rings of color
    float ring1 = sin((dist - clickAge * 0.8) * 20.0) * 0.5 + 0.5;
    float ring2 = sin((dist - clickAge * 0.6) * 15.0) * 0.5 + 0.5;
    
    // Hue shift based on distance from click
    float hue = dist * 3.0 + clickAge * 2.0;
    
    // Create rainbow-like explosion using sine waves
    vec3 explosionRGB = vec3(
      sin(hue) * 0.5 + 0.5,
      sin(hue + 2.094) * 0.5 + 0.5,
      sin(hue + 4.189) * 0.5 + 0.5
    );
    
    // Blend the rings for more dynamic color
    float colorMix = ring1 * 0.6 + ring2 * 0.4;
    
    // Add palette colors to the explosion for harmony
    explosionRGB = mix(explosionRGB, uColor1, 0.2);
    explosionRGB = mix(explosionRGB, uColor4, 0.2);
    explosionRGB = mix(explosionRGB, uColor6, 0.15);
    
    // Fade out the color
    float fadeOut = 1.0 - (clickAge / 1.5);
    
    return explosionRGB * colorMix * fadeOut;
  }
  
  // Radial distortion from click point
  vec2 explosionDistortion(vec2 pos, vec2 clickPos, float clickAge) {
    if (clickAge > 1.5) return vec2(0.0);
    
    vec2 delta = pos - clickPos;
    float dist = length(delta);
    
    // Push outward from click center
    float pushStrength = sin(max(0.0, 0.8 - dist) * PI) * (1.0 - clickAge / 1.5);
    vec2 push = normalize(delta + vec2(0.001)) * pushStrength * 0.08;
    
    return push;
  }
  
  void main() {
    // Master time variable - unified for all layers
    float masterTime = uTime * uSpeed;
    
    vec2 uv = vUv;
    vec2 advected = advectPosition(uv, masterTime);
    
    // Calculate click effect age
    float clickAge = masterTime - uClickTime;
    
    // Apply explosion distortion to position
    vec2 explosionDist = explosionDistortion(advected, uClickPos, clickAge);
    vec2 distortedAdvected = advected + explosionDist;
    
    // Apply domain warping to break up geometric patterns
    vec2 warpedAdvected = domainWarp(distortedAdvected, masterTime);
    
    // Multi-layer FBM with larger scales to create organic background
    // Use lower initial frequencies and domain warping to eliminate grid-like patterns
    float fbmDensity1 = fbm(warpedAdvected * 0.8, masterTime * 0.2, 5);
    float fbmDensity2 = fbm(warpedAdvected * 1.5 + masterTime * 0.1, masterTime * 0.25, 4);
    float fbmDensity3 = fbm(warpedAdvected * 2.8 + masterTime * 0.15, masterTime * 0.3, 3);
    
    // Use smoother blending to avoid visible layer boundaries
    float density = fbmDensity1 * 0.5 + fbmDensity2 * 0.35 + fbmDensity3 * 0.15;
    
    // Apply additional smoothing via sin/cos to round out sharp transitions
    density = sin(density * PI) * 0.5 + 0.5;
    
    // Blend with domain-warped secondary pass for additional smoothness
    float densitySmooth = fbm(warpedAdvected * 0.4, masterTime * 0.15, 3);
    density = mix(density, densitySmooth, 0.3);
    
    // Get velocity magnitude for color brightness
    vec2 flowVel = advectPosition(uv, uTime * uSpeed) - uv;
    float speed = length(flowVel) * 20.0;
    speed = clamp(speed, 0.0, 1.0);
    
    // Create rotation pattern from polar coordinates
    vec2 center = vec2(0.5, 0.5);
    vec2 toCenter = advected - center;
    float angle = atan(toCenter.y, toCenter.x);
    float radius = length(toCenter);
    
    // Multi-layer spiral patterns with different frequencies (reduced rotation speed)
    float spiral1 = sin(angle * 3.0 - radius * 6.0 - masterTime * 0.3) * 0.5 + 0.5;
    float spiral2 = sin(angle * 7.0 - radius * 12.0 - masterTime * 0.5) * 0.5 + 0.5;
    float spiral3 = sin(angle * 13.0 - radius * 20.0 - masterTime * 0.7) * 0.5 + 0.5;
    
    // Vortex strength decreases toward edges
    float vortexStrength = exp(-radius * radius * 3.0);
    
    // Combine spirals for fractal-like complexity
    float spiral = spiral1 * 0.5 + spiral2 * 0.35 + spiral3 * 0.15;
    spiral = mix(spiral, density, 0.5);
    
    // Mouse influence on pattern with stronger effect
    float mouseInfluence = exp(-distance(uv, uMouse) * 3.0) * uWaveIntensity;
    spiral = mix(spiral, speed, mouseInfluence * 0.5);
    
    // Multi-octave color cycling for psychedelic effect
    float colorFlow = spiral * 0.4 + density * 0.35 + speed * 0.25;
    
    // Complex hue shifting with multiple time-dependent waves
    float hueShift = angle * 0.159 + masterTime * 0.15;
    float hueShift2 = radius * 0.5 - masterTime * 0.2;
    float hueShift3 = (angle + radius) * 0.3 + masterTime * 0.1;
    
    // Multi-level color cycling
    float colorMix1 = sin(colorFlow * PI * 2.0 + hueShift) * 0.5 + 0.5;
    float colorMix2 = cos(colorFlow * PI + hueShift2) * 0.5 + 0.5;
    float colorMix3 = sin(colorFlow * PI * 0.5 + hueShift3) * 0.5 + 0.5;
    float colorMix4 = cos(colorFlow * PI * 1.5 + hueShift) * 0.5 + 0.5;
    
    // Dynamic color cycling - continuously shift through multiple palettes (reduced speed)
    float paletteTime = masterTime * 0.02;
    
    // Create smooth color transitions through palette animation
    float palette1 = sin(paletteTime) * 0.5 + 0.5;
    float palette2 = sin(paletteTime + 2.094) * 0.5 + 0.5;
    float palette3 = sin(paletteTime + 4.189) * 0.5 + 0.5;
    
    // Psychedelic color blending with 6 dynamic colors
    vec3 color = mix(uColor1, uColor2, colorMix1);
    color = mix(color, uColor3, colorMix2);
    color = mix(color, uColor4, sin(colorFlow * PI + paletteTime) * 0.5 + 0.5);
    color = mix(color, uColor5, cos(colorFlow * PI + paletteTime * 1.3) * 0.5 + 0.5);
    color = mix(color, uColor6, sin(colorFlow * 0.5 * PI + paletteTime * 0.7) * 0.5 + 0.5);
    
    // Smooth palette interpolation based on time
    float basePaletteInfluence = 0.35;
    color = mix(color, mix(uColor1, uColor3, palette1), basePaletteInfluence * 0.3);
    color = mix(color, mix(uColor2, uColor5, palette2), basePaletteInfluence * 0.25);
    color = mix(color, mix(uColor4, uColor6, palette3), basePaletteInfluence * 0.2);
    
    // Add interference patterns for extra depth
    float interference = sin(colorFlow * 10.0 + angle * 5.0 + paletteTime) * 0.5 + 0.5;
    interference *= cos(density * 8.0 + masterTime * 0.2 + paletteTime * 0.5) * 0.5 + 0.5;
    
    // Blend with interference for psychedelic shimmer
    color = mix(color, vec3(colorMix3, colorMix4, interference), 0.18);
    
    // Time-based hue shifting for constant color evolution (slower)
    float hueEvolution = sin(masterTime * 0.01) * 0.5 + 0.5;
    vec3 hueShiftColor = mix(uColor1, uColor6, hueEvolution);
    color = mix(color, hueShiftColor * color, 0.15);
    
    // Enhance brightness where flow is faster with glow effect (gentle pulsing)
    float glowIntensity = speed * vortexStrength * (sin(masterTime * 0.5) * 0.25 + 0.75);
    color += vec3(0.2, 0.15, 0.25) * glowIntensity;
    color += vec3(0.1, 0.2, 0.15) * density * interference * (cos(masterTime * 0.4) * 0.3 + 0.7);
    
    // Dynamic saturation and contrast based on time-based pulsing (slower)
    vec3 saturated = color * color;
    float saturation = speed * 0.4 + density * 0.3 + interference * 0.3;
    float pulsing = sin(masterTime * 0.3 + colorFlow * 1.5) * 0.25 + 0.75;
    color = mix(color, saturated, saturation * pulsing * 0.5);
    
    // Contrast boost that pulses with animation (gentle pulsing)
    float contrastBoost = sin(masterTime * 0.2 + density * 2.0) * 0.2 + 0.8;
    color = pow(color, vec3(0.9 * contrastBoost, 1.0 * contrastBoost, 1.1 * contrastBoost));
    
    // Subtle glow and softness pass for diffuse, dreamy effect
    // Add bloom-like glow to brighten areas naturally
    vec3 glowColor = color * color * 0.5;
    color = mix(color, color + glowColor, 0.2);
    
    // Reduce overall sharpness with subtle desaturation and softening
    vec3 desaturated = vec3(dot(color, vec3(0.299, 0.587, 0.114)));
    color = mix(color, desaturated, 0.05);
    
    // Apply gentle tone mapping for a softer, more cinematic look
    color = color / (color + vec3(0.8));
    
    // Add very subtle blur-like effect through noise floor (reduces visible edges)
    float softness = 0.08;
    color += softness * 0.15;
    
    // Apply explosion ripple effect
    float ripple = explosionRipple(advected, uClickPos, clickAge);
    
    // Get explosion color burst
    vec3 expColor = explosionColor(advected, uClickPos, clickAge);
    
    // Blend explosion colors with base color
    color = mix(color, expColor, ripple * 0.9);
    
    // Add vibrant glow from the explosion
    color += expColor * ripple * 0.6;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

interface ShaderCanvasProps {
  isPaused: boolean;
  speed: number;
  waveIntensity: number;
  colorPalette: number;
}

export default function ShaderCanvas({
  isPaused,
  speed,
  waveIntensity,
  colorPalette,
}: ShaderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const mouseVelocityRef = useRef({ x: 0, y: 0 });
  const mouseForceRef = useRef(0);
  const previousMouseRef = useRef({ x: 0.5, y: 0.5 });
  const clockRef = useRef(new THREE.Clock());
  const animationIdRef = useRef<number | null>(null);
  const frozenTimeRef = useRef<number | null>(null);
  const wasPausedRef = useRef(false);

  const colorPalettes = [
    // 1. Neon Pink & Purple
    { colors: [0xff006e, 0xfb5607, 0x8338ec, 0x3a86ff, 0xfb5607, 0xffbe0b] },
    // 2. Cosmic Blue & Magenta
    { colors: [0x0a0e27, 0x15aabf, 0xd61355, 0xff006e, 0x8338ec, 0xffbe0b] },
    // 3. Sunset Orange & Pink
    { colors: [0xff006e, 0xffa500, 0xff6b6b, 0xf72585, 0xffd60a, 0xfd7e14] },
    // 4. Cyan & Lime
    { colors: [0x00d2d3, 0x00f2fe, 0x00ff88, 0x00ffff, 0x39ff14, 0x76ff03] },
    // 5. Deep Purple & Gold
    { colors: [0x2d1b69, 0x663399, 0xffd60a, 0xff006e, 0xd946ef, 0x00d9ff] },
    // 6. Psychedelic Rainbow
    { colors: [0xff0080, 0xff8c00, 0xffff00, 0x00ff00, 0x0080ff, 0xff0080] },
    // 7. Neon Green & Pink
    { colors: [0x39ff14, 0xff1493, 0xffd60a, 0x00ffff, 0xff006e, 0x00ff88] },
    // 8. Thermal Magma
    { colors: [0x000000, 0xff0000, 0xff6600, 0xffff00, 0xff00ff, 0x00ffff] },
    // 9. Aurora Borealis (soft greens, blues, purples)
    { colors: [0x1a472a, 0x2a8f6f, 0x5dd4d4, 0x7b68ee, 0x9370db, 0x87ceeb] },
    // 10. Ocean Depths (deep blues, teals, dark greens)
    { colors: [0x001f3f, 0x003d82, 0x0066cc, 0x00ccff, 0x00ffcc, 0x1a9b8e] },
    // 11. Pastel Dream (soft, muted tones)
    { colors: [0xffc0cb, 0xffe4e1, 0xf0e68c, 0xdda0dd, 0xb0e0e6, 0xf5deb3] },
    // 12. Deep Space (dark purples, blues, blacks with neon accents)
    { colors: [0x0a0015, 0x1a0033, 0x330066, 0x6600cc, 0x00ffff, 0xff00ff] },
    // 13. Lava Flow (reds, oranges, yellows)
    { colors: [0x330000, 0x660000, 0xff3300, 0xff6600, 0xff9900, 0xffcc00] },
    // 14. Emerald Forest (greens, teals, earth tones)
    { colors: [0x1a4d2e, 0x2d6a4f, 0x52b788, 0x74c69d, 0xb7e4c7, 0x95d5b2] },
    // 15. Twilight (indigo, purple, pink, warm tones)
    { colors: [0x2d1b4e, 0x4a235a, 0x8e44ad, 0xc0392b, 0xe74c3c, 0xf39c12] },
    // 16. Minty Fresh (mint, cyan, light greens, whites)
    { colors: [0x00ffa6, 0x00ff88, 0x7fffd4, 0x00ffff, 0x98ff98, 0xe0ffff] },
  ];

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(
      -1,
      1,
      1,
      -1,
      0.1,
      1000
    );
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    rendererRef.current = renderer;
    renderer.setClearColor(0x000000);

    const handleResize = () => {
      if (!canvasRef.current) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Create shader material with dynamic color uniforms
    const uniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uMouseVelocity: { value: new THREE.Vector2(0, 0) },
      uMouseForce: { value: 0 },
      uClickPos: { value: new THREE.Vector2(0.5, 0.5) },
      uClickTime: { value: -10 },
      uSpeed: { value: speed },
      uWaveIntensity: { value: waveIntensity },
      uColor1: { value: new THREE.Color(0xff006e) },
      uColor2: { value: new THREE.Color(0xfb5607) },
      uColor3: { value: new THREE.Color(0x8338ec) },
      uColor4: { value: new THREE.Color(0x3a86ff) },
      uColor5: { value: new THREE.Color(0xfb5607) },
      uColor6: { value: new THREE.Color(0xffbe0b) },
      uPaletteBlend: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
    });
    materialRef.current = material;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      let elapsed: number;
      
      if (isPaused) {
        // Capture the current time when pause is first triggered
        if (!wasPausedRef.current) {
          frozenTimeRef.current = clockRef.current.getElapsedTime();
          wasPausedRef.current = true;
        }
        // Use the frozen time while paused (zero visual changes)
        elapsed = frozenTimeRef.current!;
      } else {
        // Resume animation from frozen time
        if (wasPausedRef.current) {
          // Calculate the offset to resume from frozen time
          const currentTime = clockRef.current.getElapsedTime();
          clockRef.current.start();
          wasPausedRef.current = false;
        }
        elapsed = clockRef.current.getElapsedTime();
      }

      if (material) {
        // Apply inertial decay to mouse force (smooth falloff - slower decay for calm feel)
        mouseForceRef.current *= 0.95; // Gentle friction coefficient for sustained motion

        material.uniforms.uTime.value = elapsed;
        material.uniforms.uMouse.value.x = mouseRef.current.x;
        material.uniforms.uMouse.value.y = mouseRef.current.y;
        material.uniforms.uMouseVelocity.value.x = mouseVelocityRef.current.x;
        material.uniforms.uMouseVelocity.value.y = mouseVelocityRef.current.y;
        material.uniforms.uMouseForce.value = mouseForceRef.current;
        material.uniforms.uSpeed.value = speed;
        material.uniforms.uWaveIntensity.value = waveIntensity;

        // Dynamic palette cycling - continuously shift through color palettes (extremely slowly for smooth transitions)
        const cycleSpeed = 0.015; // Reduced from 0.03 for even smoother transitions
        const currentPaletteIndex = Math.floor(elapsed * cycleSpeed + colorPalette) % colorPalettes.length;
        const nextPaletteIndex = (currentPaletteIndex + 1) % colorPalettes.length;
        const paletteBlend = (elapsed * cycleSpeed + colorPalette) % 1.0;
        
        const currentPalette = colorPalettes[currentPaletteIndex];
        const nextPalette = colorPalettes[nextPaletteIndex];

        // Smoothly interpolate between palette colors
        for (let i = 0; i < 6; i++) {
          const currentColor = new THREE.Color(currentPalette.colors[i]);
          const nextColor = new THREE.Color(nextPalette.colors[i]);
          const blended = new THREE.Color().lerpColors(currentColor, nextColor, paletteBlend);
          material.uniforms[`uColor${i + 1}`].value = blended;
        }

        material.uniforms.uPaletteBlend.value = paletteBlend;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Mouse tracking with velocity calculation
    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX / window.innerWidth;
      const newY = 1 - e.clientY / window.innerHeight;

      // Calculate velocity (change in position per frame)
      mouseVelocityRef.current.x = newX - mouseRef.current.x;
      mouseVelocityRef.current.y = newY - mouseRef.current.y;

      // Calculate velocity magnitude for force
      const velocityMagnitude = Math.sqrt(
        mouseVelocityRef.current.x ** 2 + mouseVelocityRef.current.y ** 2
      );

      // Apply force based on velocity (reduced for soft interaction)
      mouseForceRef.current = Math.min(velocityMagnitude * 1.2, 0.6);

      // Update position
      mouseRef.current.x = newX;
      mouseRef.current.y = newY;
    };

    // Click explosion ripple effect
    const handleClick = (e: MouseEvent) => {
      if (materialRef.current && clockRef.current) {
        // Calculate normalized click position
        const clickX = e.clientX / window.innerWidth;
        const clickY = 1 - e.clientY / window.innerHeight;
        
        // Set click position and time in shader
        materialRef.current.uniforms.uClickPos.value = new THREE.Vector2(clickX, clickY);
        materialRef.current.uniforms.uClickTime.value = clockRef.current.getElapsedTime();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);

      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }

      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [isPaused, speed, waveIntensity, colorPalette]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full block"
    />
  );
}
