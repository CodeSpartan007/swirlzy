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
  uniform float uSpeed;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
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
  
  // Fractal Brownian Motion for smooth, organic patterns
  float fbm(vec2 st, float time) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float maxAmplitude = 0.0;
    
    for (int i = 0; i < 5; i++) {
      value += amplitude * snoise(st * frequency + time * 0.3);
      maxAmplitude += amplitude;
      st *= 2.0;
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    
    return value / maxAmplitude;
  }
  
  // Domain warping for complex swirling motion
  vec2 domainWarp(vec2 st, float time) {
    vec2 q = vec2(fbm(st + time * 0.1, time), fbm(st + vec2(5.2, 1.3) + time * 0.1, time));
    vec2 r = vec2(fbm(st + 2.0 * q + time * 0.1, time), fbm(st + 2.0 * q + vec2(1.7, 9.2) + time * 0.1, time));
    return r;
  }
  
  void main() {
    vec2 uv = vUv;
    vec2 center = vec2(0.5, 0.5);
    
    // Polar coordinates for vortex-like effect
    vec2 toCenter = uv - center;
    float angle = atan(toCenter.y, toCenter.x);
    float dist = length(toCenter);
    
    // Apply domain warping for fluid distortion
    vec2 warpUv = domainWarp(uv + angle * 0.5, uTime * uSpeed);
    
    // Mouse-driven fluid distortion (smooth, dragging liquid effect)
    vec2 mouseOffset = (uMouse - center) * 0.3;
    vec2 distortedUv = uv + mouseOffset * exp(-dist * 8.0);
    
    // Multi-scale fbm for smooth, layered effect
    float fbmValue = fbm(distortedUv * 2.0 + warpUv * 0.5, uTime * uSpeed * 0.8);
    
    // Vortex rotation based on distance and time
    float vortex = sin(angle * 5.0 - uTime * uSpeed * 0.5) * 0.5 + 0.5;
    float turbulence = fbm(uv * 3.0 + uTime * uSpeed * 0.3, uTime * uSpeed) * 0.5 + 0.5;
    
    // Ripple waves propagating from mouse
    float mouseDistance = distance(uv, uMouse);
    float ripple = sin(mouseDistance * 30.0 - uTime * 6.0) * 0.5 + 0.5;
    ripple *= exp(-mouseDistance * 4.0) * uWaveIntensity;
    
    // Combine all effects smoothly
    float pattern = fbmValue * 0.4 + vortex * 0.35 + turbulence * 0.25;
    pattern += ripple * 0.3;
    
    // Smooth color blending with gradients
    float colorMix = sin(pattern * PI * 2.0 + uTime * uSpeed * 0.4) * 0.5 + 0.5;
    float colorMix2 = cos(pattern * PI + uTime * uSpeed * 0.3) * 0.5 + 0.5;
    
    // Blend three colors smoothly
    vec3 color = mix(uColor1, uColor2, colorMix);
    color = mix(color, uColor3, colorMix2);
    
    // Add subtle glow/bloom effect
    color += vec3(0.1, 0.05, 0.15) * (fbmValue * 0.3 + vortex * 0.2);
    
    // Smoothness and saturation
    color = mix(color, color * color, 0.2);
    
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
  const clockRef = useRef(new THREE.Clock());
  const animationIdRef = useRef<number | null>(null);

  const colorPalettes = [
    {
      color1: new THREE.Color(0xff6b9d),
      color2: new THREE.Color(0xc06c84),
      color3: new THREE.Color(0x6c5ce7),
    },
    {
      color1: new THREE.Color(0x00d2d3),
      color2: new THREE.Color(0x30cfd0),
      color3: new THREE.Color(0x330867),
    },
    {
      color1: new THREE.Color(0xa8edea),
      color2: new THREE.Color(0xfed6e3),
      color3: new THREE.Color(0xff9a56),
    },
    {
      color1: new THREE.Color(0x667eea),
      color2: new THREE.Color(0x764ba2),
      color3: new THREE.Color(0xf093fb),
    },
    {
      color1: new THREE.Color(0x4facfe),
      color2: new THREE.Color(0x00f2fe),
      color3: new THREE.Color(0xffa500),
    },
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

    // Create shader material
    const uniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uSpeed: { value: speed },
      uWaveIntensity: { value: waveIntensity },
      uColor1: { value: colorPalettes[0].color1 },
      uColor2: { value: colorPalettes[0].color2 },
      uColor3: { value: colorPalettes[0].color3 },
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

      const elapsed = isPaused ? 0 : clockRef.current.getElapsedTime();

      if (material) {
        material.uniforms.uTime.value = elapsed;
        material.uniforms.uMouse.value.x = mouseRef.current.x;
        material.uniforms.uMouse.value.y = mouseRef.current.y;
        material.uniforms.uSpeed.value = speed;
        material.uniforms.uWaveIntensity.value = waveIntensity;

        const palette = colorPalettes[colorPalette % colorPalettes.length];
        material.uniforms.uColor1.value = palette.color1;
        material.uniforms.uColor2.value = palette.color2;
        material.uniforms.uColor3.value = palette.color3;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX / window.innerWidth;
      mouseRef.current.y = 1 - e.clientY / window.innerHeight;
    };

    // Click ripple effect
    const handleClick = () => {
      if (materialRef.current) {
        const currentIntensity = materialRef.current.uniforms.uWaveIntensity.value;
        materialRef.current.uniforms.uWaveIntensity.value = currentIntensity + 0.5;
        setTimeout(() => {
          if (materialRef.current) {
            materialRef.current.uniforms.uWaveIntensity.value = waveIntensity;
          }
        }, 300);
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
