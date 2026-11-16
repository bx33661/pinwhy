import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line, RoundedBox } from '@react-three/drei';
import { DoubleSide } from 'three';
import { boardMaterial } from './board-material';
import type { Block, SceneBounds } from './model';
import type { Palette } from './palette';

const THICKNESS = 0.24;
/** Distance from the board's edge to the printed border and the mounting holes. */
const INSET = 0.38;
/** How far below the board the stage lies, so the board visibly floats over its own shadow. */
const STAGE_DROP = 1.3;

/** A finished board: a dual-layer lacquered PCB with a printed border and plated mounting holes, floating over its own shadow. */
export function BoardMesh({ board, palette, dark, current, motion }: { board: SceneBounds; palette: Palette; dark: boolean; current?: Block; motion: boolean }) {
  const { cx, cz, w, d } = board;
  const invalidate = useThree((state) => state.invalidate);
  const skin = useMemo(
    () => boardMaterial(palette, dark, palette.color('--live').multiplyScalar(dark ? 1.5 : 0.9), cx, cz, Math.hypot(w, d) / 2),
    [palette, dark, cx, cz, w, d],
  );
  useEffect(() => () => skin.material.dispose(), [skin]);
  const reach = Math.max(8, Math.min(18, Math.hypot(w, d) / 2));
  useLayoutEffect(() => {
    if (!motion || !current) skin.scanPower.value = 0;
    invalidate();
  }, [skin, current, motion, invalidate]);
  useFrame((state) => {
    if (!current || !motion) return;
    const radius = (state.clock.elapsedTime * 2.2) % reach;
    skin.scan.value.set(current.x, current.z, radius);
    skin.scanPower.value = 1 - radius / reach;
  });
  const l = cx - w / 2 + INSET, r = cx + w / 2 - INSET, t = cz - d / 2 + INSET, b = cz + d / 2 - INSET;
  const border = palette.css(dark ? 'color-mix(in srgb, #3fd1c0 24%, var(--line-strong))' : '--line-strong');
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[cx, -STAGE_DROP, cz]} receiveShadow raycast={() => null}>
        <planeGeometry args={[Math.hypot(w, d) * 10, Math.hypot(w, d) * 10]} />
        {/* Catches the shadow only: the stage keeps the scene background's exact colour under any light. */}
        <shadowMaterial opacity={dark ? 0.55 : 0.13} />
      </mesh>
      <RoundedBox args={[w, THICKNESS, d]} radius={0.08} smoothness={3} position={[cx, -THICKNESS / 2, cz]} castShadow receiveShadow raycast={() => null}>
        <primitive object={skin.material} attach="material" />
      </RoundedBox>
      <RoundedBox args={[w + 0.05, 0.06, d + 0.05]} radius={0.02} smoothness={2} position={[cx, -THICKNESS + 0.02, cz]} raycast={() => null}>
        <meshStandardMaterial color={dark ? '#182420' : '#dfe3e8'} metalness={0.25} roughness={0.5} />
      </RoundedBox>
      <Line points={[[l, 0.012, t], [r, 0.012, t], [r, 0.012, b], [l, 0.012, b], [l, 0.012, t]]} color={border} lineWidth={1} transparent opacity={dark ? 0.5 : 0.65} toneMapped={false} raycast={() => null} />
      {[[l, t], [r, t], [l, b], [r, b]].map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <mesh rotation-x={-Math.PI / 2} position-y={0.013} raycast={() => null}>
            <circleGeometry args={[0.085, 32]} />
            <meshStandardMaterial color={dark ? '#070b0a' : '#cbd5e1'} roughness={0.85} metalness={0.05} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.014} raycast={() => null}>
            <ringGeometry args={[0.085, 0.175, 40]} />
            <meshStandardMaterial color={dark ? '#d6b48a' : '#cfa05a'} emissive={dark ? '#5c401c' : '#6e4f22'} emissiveIntensity={0.35} metalness={0.62} roughness={0.28} side={DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}
