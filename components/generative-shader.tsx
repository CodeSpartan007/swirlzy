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
  
  // Layered fractional Brownian motion for complex depth
  float fbm(vec2 pos, float time, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float maxValue = 0.0;
    
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      
      value += amplitude * snoise(pos * frequency + time * 0.15);
      maxValue += amplitude;
      
      // Modulate frequency and phase for more complex patterns
      frequency *= 2.345;
      amplitude *= 0.5;
      pos *= 1.8 + sin(time * 0.2 + float(i)) * 0.3;
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
    
    // Add time-based pulsing for dynamics
    circulation *= (sin(uTime * 2.0 + angle * 3.0) * 0.3 + 0.7);
    
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
  
  // Advect particles through flow field
  vec2 advectPosition(vec2 pos, float time) {
    // Primary rotating flow from center
    vec2 centerVortex = vortexFlow(pos, vec2(0.5, 0.5), 1.5, time);
    
    // Mouse-driven vortex (interactive)
    vec2 mouseVortex = vortexFlow(pos, uMouse, uWaveIntensity * 2.0, time);
    
    // Momentum-driven liquid push from mouse movement (with inertia)
    vec2 inertiaFlow = mouseInertiaFlow(pos, uMouse, uMouseVelocity, uMouseForce);
    
    // Curl noise for added turbulence
    vec2 turbulence = curlFlow(pos * 3.0, time) * 0.5;
    
    // Combine flows: inertia adds immediate responsive push
    vec2 flow = centerVortex * 0.5 + mouseVortex * 0.2 + inertiaFlow * 0.4 + turbulence * 0.1;
    
    // Advect position along flow
    return pos + flow * 0.02;
  }
  
  void main() {
    vec2 uv = vUv;
    vec2 advected = advectPosition(uv, uTime * uSpeed);
    
    // Multi-layer FBM sampling for deep complexity
    float fbmDensity1 = fbm(advected * 2.0, uTime * uSpeed, 6);
    float fbmDensity2 = fbm(advected * 4.0 + uTime * 0.5, uTime * uSpeed, 5);
    float fbmDensity3 = fbm(advected * 8.0 - uTime * 0.3, uTime * uSpeed, 4);
    float fbmDensity4 = fbm(advected * 16.0, uTime * uSpeed * 0.7, 3);
    
    // Layer density with varying weights
    float density = fbmDensity1 * 0.4 + fbmDensity2 * 0.3 + fbmDensity3 * 0.2 + fbmDensity4 * 0.1;
    
    // Get velocity magnitude for color brightness
    vec2 flowVel = advectPosition(uv, uTime * uSpeed) - uv;
    float speed = length(flowVel) * 20.0;
    speed = clamp(speed, 0.0, 1.0);
    
    // Create rotation pattern from polar coordinates
    vec2 center = vec2(0.5, 0.5);
    vec2 toCenter = advected - center;
    float angle = atan(toCenter.y, toCenter.x);
    float radius = length(toCenter);
    
    // Multi-layer spiral patterns with different frequencies
    float spiral1 = sin(angle * 3.0 - radius * 6.0 - uTime * uSpeed * 1.5) * 0.5 + 0.5;
    float spiral2 = sin(angle * 7.0 - radius * 12.0 - uTime * uSpeed * 2.3) * 0.5 + 0.5;
    float spiral3 = sin(angle * 13.0 - radius * 20.0 - uTime * uSpeed * 3.1) * 0.5 + 0.5;
    
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
    float hueShift = angle * 0.159 + uTime * uSpeed * 0.15;
    float hueShift2 = radius * 0.5 - uTime * uSpeed * 0.2;
    float hueShift3 = (angle + radius) * 0.3 + uTime * uSpeed * 0.1;
    
    // Multi-level color cycling
    float colorMix1 = sin(colorFlow * PI * 2.0 + hueShift) * 0.5 + 0.5;
    float colorMix2 = cos(colorFlow * PI + hueShift2) * 0.5 + 0.5;
    float colorMix3 = sin(colorFlow * PI * 0.5 + hueShift3) * 0.5 + 0.5;
    float colorMix4 = cos(colorFlow * PI * 1.5 + hueShift) * 0.5 + 0.5;
    
    // Psychedelic color blending
    vec3 color = mix(uColor1, uColor2, colorMix1);
    color = mix(color, uColor3, colorMix2);
    
    // Add interference patterns for extra depth
    float interference = sin(colorFlow * 10.0 + angle * 5.0) * 0.5 + 0.5;
    interference *= cos(density * 8.0 + uTime * 2.0) * 0.5 + 0.5;
    
    // Blend with interference for psychedelic shimmer
    color = mix(color, vec3(colorMix3, colorMix4, interference), 0.15);
    
    // Enhance brightness where flow is faster with glow effect
    color += vec3(0.2, 0.15, 0.25) * speed * vortexStrength;
    color += vec3(0.1, 0.2, 0.15) * density * interference;
    
    // Dynamic saturation boost based on multiple factors
    vec3 saturated = color * color;
    float saturation = speed * 0.4 + density * 0.3 + interference * 0.3;
    color = mix(color, saturated, saturation * 0.5);
    
    // Final psychedelic boost
    color = pow(color, vec3(0.9, 1.0, 1.1));
    
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
      uMouseVelocity: { value: new THREE.Vector2(0, 0) },
      uMouseForce: { value: 0 },
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
        // Apply inertial decay to mouse force (smooth falloff)
        mouseForceRef.current *= 0.92; // Friction coefficient for smooth decay

        material.uniforms.uTime.value = elapsed;
        material.uniforms.uMouse.value.x = mouseRef.current.x;
        material.uniforms.uMouse.value.y = mouseRef.current.y;
        material.uniforms.uMouseVelocity.value.x = mouseVelocityRef.current.x;
        material.uniforms.uMouseVelocity.value.y = mouseVelocityRef.current.y;
        material.uniforms.uMouseForce.value = mouseForceRef.current;
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

      // Apply force based on velocity (faster movement = more liquid push)
      mouseForceRef.current = Math.min(velocityMagnitude * 3.0, 1.5);

      // Update position
      mouseRef.current.x = newX;
      mouseRef.current.y = newY;
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
