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
  
  void main() {
    vec2 uv = vUv;
    
    // Mouse ripple
    float ripple = sin(distance(uv, uMouse) * 20.0 - uTime * 4.0) * 0.5 + 0.5;
    ripple *= exp(-distance(uv, uMouse) * 3.0);
    
    // Multi-layered noise
    float noise1 = snoise(uv * 3.0 + uTime * uSpeed * 0.1) * 0.5 + 0.5;
    float noise2 = snoise(uv * 5.0 + uTime * uSpeed * 0.15 + vec2(100.0)) * 0.5 + 0.5;
    float noise3 = snoise(uv * 8.0 + uTime * uSpeed * 0.2 + vec2(200.0)) * 0.5 + 0.5;
    
    // Mouse distortion
    vec2 distorted = uv + (uMouse - 0.5) * 0.2;
    float noiseFlow = snoise(distorted * 4.0 + uTime * uSpeed * 0.12);
    
    // Combine layers
    float combined = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
    combined += ripple * uWaveIntensity * 0.5;
    combined += noiseFlow * 0.1;
    
    // Color interpolation
    vec3 color = mix(uColor1, uColor2, combined);
    color = mix(color, uColor3, sin(combined + uTime * 0.5) * 0.5 + 0.5);
    
    // Add some brightness variation
    color += sin(uTime * 0.3 + uv.y * 5.0) * 0.1;
    
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
