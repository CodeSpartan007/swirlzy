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
  
  // Vector field-based curl noise for smooth fluid motion
  vec2 curlFlow(vec2 pos, float time) {
    float n1 = snoise(pos + time * 0.2);
    float n2 = snoise(pos + 5.234 + time * 0.2);
    float n3 = snoise(pos + 10.768 + time * 0.2);
    
    vec2 grad = normalize(vec2(
      snoise(pos + vec2(0.01, 0.0) + time * 0.2) - n1,
      snoise(pos + vec2(0.0, 0.01) + time * 0.2) - n2
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
    
    // Add time-based pulsing for dynamics
    circulation *= (sin(uTime * 2.0 + angle * 3.0) * 0.3 + 0.7);
    
    return tangent * circulation;
  }
  
  // Advect particles through flow field
  vec2 advectPosition(vec2 pos, float time) {
    // Primary rotating flow from center
    vec2 centerVortex = vortexFlow(pos, vec2(0.5, 0.5), 1.5, time);
    
    // Mouse-driven vortex (interactive)
    vec2 mouseVortex = vortexFlow(pos, uMouse, uWaveIntensity * 2.0, time);
    
    // Curl noise for added turbulence
    vec2 turbulence = curlFlow(pos * 3.0, time) * 0.5;
    
    // Combine flows
    vec2 flow = centerVortex * 0.6 + mouseVortex * 0.3 + turbulence * 0.1;
    
    // Advect position along flow
    return pos + flow * 0.02;
  }
  
  void main() {
    vec2 uv = vUv;
    vec2 advected = advectPosition(uv, uTime * uSpeed);
    
    // Sample density along advected path
    float density = snoise(advected * 4.0) * 0.5 + 0.5;
    density += snoise(advected * 8.0 + uTime * uSpeed * 0.5) * 0.25;
    density += snoise(advected * 2.0 - uTime * uSpeed * 0.3) * 0.25;
    
    // Get velocity magnitude for color brightness
    vec2 flowVel = advectPosition(uv, uTime * uSpeed) - uv;
    float speed = length(flowVel) * 20.0;
    speed = clamp(speed, 0.0, 1.0);
    
    // Create rotation pattern from polar coordinates
    vec2 center = vec2(0.5, 0.5);
    vec2 toCenter = advected - center;
    float angle = atan(toCenter.y, toCenter.x);
    float radius = length(toCenter);
    
    // Spiral pattern flowing outward/inward
    float spiral = sin(angle * 4.0 - radius * 8.0 - uTime * uSpeed * 2.0) * 0.5 + 0.5;
    
    // Vortex strength decreases toward edges
    float vortexStrength = exp(-radius * radius * 3.0);
    spiral = mix(spiral, density, 0.4);
    
    // Mouse influence on pattern
    float mouseInfluence = exp(-distance(uv, uMouse) * 4.0) * uWaveIntensity;
    spiral = mix(spiral, speed, mouseInfluence * 0.3);
    
    // Multi-layer color based on flow properties
    float colorFlow = spiral * 0.5 + density * 0.3 + speed * 0.2;
    
    // Smooth color transitions along the flow
    float hueShift = angle * 0.159 + uTime * uSpeed * 0.1;
    float colorMix1 = sin(colorFlow * PI + hueShift) * 0.5 + 0.5;
    float colorMix2 = cos(colorFlow * PI + hueShift + 2.094) * 0.5 + 0.5;
    
    // Blend colors based on flow field
    vec3 color = mix(uColor1, uColor2, colorMix1);
    color = mix(color, uColor3, colorMix2);
    
    // Enhance brightness where flow is faster
    color += vec3(0.15, 0.1, 0.2) * speed * vortexStrength;
    
    // Add subtle color saturation boost in high-flow regions
    vec3 saturated = color * color;
    color = mix(color, saturated, speed * 0.3);
    
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
