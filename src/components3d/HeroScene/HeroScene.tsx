import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import "../../styles/HeroScene.css";

const nodes: [number, number, number][] = [
  [-1.8, 1.2, 0.2],
  [-0.8, 1.8, -0.4],
  [0.4, 1.5, 0.3],
  [1.5, 1.8, -0.2],

  [-1.5, 0.2, -0.5],
  [-0.5, 0.5, 0.4],
  [0.7, 0.3, -0.3],
  [1.7, 0.5, 0.5],

  [-1.2, -1, 0.2],
  [0, -0.8, -0.4],
  [1.2, -1, 0.3],
];

const connections: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],

  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],

  [4, 5],
  [5, 6],
  [6, 7],

  [4, 8],
  [5, 9],
  [6, 10],

  [8, 9],
  [9, 10],

  [1, 5],
  [5, 9],
  [2, 6],
];

function Network() {
  const groupRef = useRef<THREE.Group>(null);

  const linePositions = useMemo(() => {
    return connections.map(([from, to]) => [
      nodes[from],
      nodes[to],
    ]);
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();

    // =========================
    // MOUSE
    // =========================

    const mouseX = state.pointer.x;
    const mouseY = state.pointer.y;

    // =========================
    // ROTAÇÃO AUTOMÁTICA
    // =========================

    const autoRotationY = time * 0.08;

    const autoRotationX =
      Math.sin(time * 0.35) * 0.08;

    // =========================
    // INFLUÊNCIA DO MOUSE
    // =========================

    const mouseRotationY = mouseX * 0.35;
    const mouseRotationX = -mouseY * 0.25;

    // =========================
    // ROTAÇÃO FINAL
    // =========================

    const targetRotationY =
      autoRotationY + mouseRotationY;

    const targetRotationX =
      autoRotationX + mouseRotationX;

    // =========================
    // MOVIMENTO SUAVE
    // =========================

    groupRef.current.rotation.y =
      THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        targetRotationY,
        0.05
      );

    groupRef.current.rotation.x =
      THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        targetRotationX,
        0.05
      );

    // =========================
    // FLUTUAÇÃO
    // =========================

    groupRef.current.position.y =
      Math.sin(time * 0.6) * 0.08;
  });

  return (
    <group
      ref={groupRef}
      scale={1.2}
    >
      {/* NÓS */}

      {nodes.map((position, index) => (
        <mesh
          key={index}
          position={position}
        >
          <sphereGeometry
            args={[0.08, 16, 16]}
          />

          <meshBasicMaterial
            color="#ffffff"
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* CONEXÕES */}

      {linePositions.map(
        ([start, end], index) => (
          <Line
            key={index}
            points={[start, end]}
            color="#666666"
            lineWidth={1}
            transparent
            opacity={0.7}
          />
        )
      )}
    </group>
  );
}

function Scene() {
  return <Network />;
}

function HeroScene() {
  return (
    <div className="hero-scene">
      <Canvas
        camera={{
          position: [0, 0, 6],
          fov: 45,
        }}
        dpr={[1, 2]}
      >
        <Scene />
      </Canvas>
    </div>
  );
}

export default HeroScene;