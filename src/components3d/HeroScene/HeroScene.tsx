import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";

import "../../styles/HeroScene.css";

const GOLD = "#e3b951";
const GOLD_LIGHT = "#fff5c7";
const GOLD_DARK = "#68420a";
const IS_MOBILE_RENDER =
  typeof window !== "undefined" &&
  window.matchMedia("(max-width: 768px)").matches;
const GLOBE_SEGMENTS: [number, number] = IS_MOBILE_RENDER
  ? [64, 44]
  : [96, 64];
const DETAIL_SEGMENTS = IS_MOBILE_RENDER ? 18 : 24;
const ORBIT_SEGMENTS = IS_MOBILE_RENDER ? 112 : 160;
const PLATFORM_SEGMENTS = IS_MOBILE_RENDER ? 48 : 64;

const surfacePoints: [number, number][] = [
  [0.72, 0.35],
  [1.2, -0.15],
  [2.05, 0.5],
  [2.75, -0.42],
  [3.55, 0.15],
  [4.25, -0.55],
  [5.1, 0.62],
  [5.75, -0.08],
];

function Globe() {
  const globeRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const latitudeLines = useMemo(
    () =>
      [-0.72, -0.38, 0, 0.38, 0.72].map((y) => {
        const radius = Math.sqrt(1 - y * y);
        return Array.from({ length: 65 }, (_, index) => {
          const angle = (index / 64) * Math.PI * 2;
          return new THREE.Vector3(
            Math.cos(angle) * radius,
            y,
            Math.sin(angle) * radius
          );
        });
      }),
    []
  );

  const longitudeLines = useMemo(
    () =>
      [0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4].map((rotation) =>
        Array.from({ length: 65 }, (_, index) => {
          const angle = (index / 64) * Math.PI * 2;
          const x = Math.cos(angle);
          const y = Math.sin(angle);
          return new THREE.Vector3(
            x * Math.cos(rotation),
            y,
            x * Math.sin(rotation)
          );
        })
      ),
    []
  );

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    if (globeRef.current) {
      globeRef.current.rotation.y = time * 0.12;
      globeRef.current.rotation.x =
        -0.12 + Math.sin(time * 0.38) * 0.035;
    }

    if (glowRef.current) {
      const pulse = 1 + Math.sin(time * 1.35) * 0.035;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={globeRef}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.92, ...GLOBE_SEGMENTS]} />
        <meshPhysicalMaterial
          color="#8f6418"
          metalness={0.88}
          roughness={0.2}
          clearcoat={1}
          clearcoatRoughness={0.06}
          emissive={GOLD_DARK}
          emissiveIntensity={0.2}
          dithering
          transparent
          opacity={0.28}
        />
      </mesh>

      {[...latitudeLines, ...longitudeLines].map((points, index) => (
        <Line
          key={`grid-${index}`}
          points={points}
          color={index === 2 ? GOLD_LIGHT : GOLD}
          lineWidth={index === 2 ? 1.15 : 0.65}
          transparent
          opacity={index === 2 ? 0.72 : 0.38}
        />
      ))}

      {surfacePoints.map(([longitude, latitude], index) => {
        const radius = 1.015;
        const horizontalRadius = Math.cos(latitude) * radius;
        const position: [number, number, number] = [
          Math.cos(longitude) * horizontalRadius,
          Math.sin(latitude) * radius,
          Math.sin(longitude) * horizontalRadius,
        ];

        return (
          <mesh key={`location-${index}`} position={position}>
            <sphereGeometry
              args={[
                index % 3 === 0 ? 0.035 : 0.022,
                DETAIL_SEGMENTS,
                DETAIL_SEGMENTS,
              ]}
            />
            <meshBasicMaterial color={GOLD_LIGHT} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

type OrbitProps = {
  radius: number;
  rotation: [number, number, number];
  speed: number;
  phase: number;
  opacity: number;
};

function Orbit({ radius, rotation, speed, phase, opacity }: OrbitProps) {
  const orbitRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!orbitRef.current) return;
    orbitRef.current.rotation.z = phase + state.clock.getElapsedTime() * speed;
  });

  return (
    <group rotation={rotation}>
      <group ref={orbitRef}>
        <mesh>
          <torusGeometry args={[radius, 0.009, 10, ORBIT_SEGMENTS]} />
          <meshBasicMaterial
            color={GOLD}
            transparent
            opacity={opacity}
            toneMapped={false}
          />
        </mesh>

        <mesh position={[radius, 0, 0]}>
          <sphereGeometry
            args={[0.055, DETAIL_SEGMENTS, DETAIL_SEGMENTS]}
          />
          <meshPhysicalMaterial
            color={GOLD_LIGHT}
            metalness={0.8}
            roughness={0.08}
            clearcoat={1}
            emissive={GOLD}
            emissiveIntensity={0.5}
            dithering
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

type DragRotation = {
  current: { x: number; y: number };
};

function WorldSystem({ dragRotation }: { dragRotation: DragRotation }) {
  const systemRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!systemRef.current) return;

    systemRef.current.rotation.y = THREE.MathUtils.lerp(
      systemRef.current.rotation.y,
      dragRotation.current.y,
      0.08
    );
    systemRef.current.rotation.x = THREE.MathUtils.lerp(
      systemRef.current.rotation.x,
      dragRotation.current.x,
      0.08
    );
    systemRef.current.position.y =
      Math.sin(state.clock.getElapsedTime() * 0.55) * 0.055;
  });

  return (
    <group scale={1.22}>
      <group ref={systemRef}>
        <Globe />
        <Orbit radius={1.42} rotation={[0.92, 0.18, 0.12]} speed={0.18} phase={0.2} opacity={0.5} />
        <Orbit radius={1.68} rotation={[1.25, -0.42, 0.74]} speed={-0.11} phase={1.7} opacity={0.36} />
        <Orbit radius={1.9} rotation={[0.48, 0.7, -0.45]} speed={0.075} phase={3.1} opacity={0.24} />
      </group>

      <group position={[0, -1.42, 0]}>
        <pointLight
          color={GOLD_LIGHT}
          intensity={8}
          distance={3.2}
          decay={2}
          position={[0, 0.25, 0]}
        />

        <mesh position={[0, 0.34, 0]}>
          <cylinderGeometry
            args={[0.24, 0.52, 0.7, PLATFORM_SEGMENTS, 1, true]}
          />
          <meshBasicMaterial
            color={GOLD}
            transparent
            opacity={0.07}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        <mesh>
          <cylinderGeometry args={[0.68, 0.76, 0.13, PLATFORM_SEGMENTS]} />
          <meshPhysicalMaterial
            color="#4e3107"
            metalness={1}
            roughness={0.2}
            clearcoat={1}
            clearcoatRoughness={0.08}
            emissive={GOLD_DARK}
            emissiveIntensity={0.18}
            dithering
          />
        </mesh>

        <mesh position={[0, 0.071, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry
            args={[0.57, 0.035, 12, IS_MOBILE_RENDER ? 72 : 96]}
          />
          <meshBasicMaterial
            color={GOLD_LIGHT}
            transparent
            opacity={0.92}
            toneMapped={false}
          />
        </mesh>

        <mesh position={[0, 0.078, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.53, PLATFORM_SEGMENTS]} />
          <meshBasicMaterial
            color={GOLD}
            transparent
            opacity={0.14}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

function Scene({ dragRotation }: { dragRotation: DragRotation }) {
  return (
    <>
      <ambientLight intensity={0.38} />
      <directionalLight color="#fff3bf" intensity={3} position={[3, 4, 5]} />
      <pointLight color="#e8ad2f" intensity={18} distance={8} decay={2} position={[-2, -1, 3]} />
      <pointLight color="#fff0a6" intensity={12} distance={7} decay={2} position={[2.5, 2, 2]} />
      <WorldSystem dragRotation={dragRotation} />
    </>
  );
}

function HeroScene() {
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRotation = useRef({ x: 0, y: 0 });
  const dragState = useRef({
    pointerId: -1,
    lastX: 0,
    lastY: 0,
  });
  const renderDpr = useMemo(() => {
    const deviceDpr = window.devicePixelRatio || 1;
    if (IS_MOBILE_RENDER) {
      return Math.min(Math.max(deviceDpr, 1), 1.25);
    }

    return Math.min(Math.max(deviceDpr * 1.2, 1.5), 2.5);
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "120px 0px", threshold: 0 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    dragState.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState.current.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.current.lastX;
    const deltaY = event.clientY - dragState.current.lastY;

    dragRotation.current.y += deltaX * 0.009;
    dragRotation.current.x = THREE.MathUtils.clamp(
      dragRotation.current.x + deltaY * 0.009,
      -1.15,
      1.15
    );

    dragState.current.lastX = event.clientX;
    dragState.current.lastY = event.clientY;
    event.preventDefault();
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState.current.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragState.current.pointerId = -1;
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className={`hero-scene ${isDragging ? "is-dragging" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      aria-label="Globo interativo da Nexo. Arraste para girar."
    >
      <Canvas
        frameloop={isVisible ? "always" : "never"}
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={renderDpr}
        gl={{
          antialias: true,
          alpha: true,
          precision: "highp",
          powerPreference: "high-performance",
          stencil: false,
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
        }}
      >
        <Scene dragRotation={dragRotation} />
      </Canvas>
    </div>
  );
}

export default HeroScene;
