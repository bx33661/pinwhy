import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, NormalBlending, Object3D, type InstancedMesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import { ratedSeverity, type Block } from './model';
import type { Palette } from './palette';

const dummy = new Object3D();
const PIN_PITCH = 0.28;
const PIN_CORNER_INSET = 0.24;
const PIN_OFFSET = 0.052;
/** How far heat spreads around a chip and how hot it reads, by recorded severity. Low runs cold. */
const HEAT = { medium: { spread: 0.5, power: 0.35 }, high: { spread: 0.9, power: 0.7 }, critical: { spread: 1.4, power: 1 } };

function pinsOf(block: Block): [number, number][] {
  const pins: [number, number][] = [];
  const span = Math.max(0, block.w - PIN_CORNER_INSET * 2);
  const across = span > 0.1 ? Math.max(2, Math.floor(span / PIN_PITCH) + 1) : 2;
  const step = across > 1 ? Math.min(PIN_PITCH, span / (across - 1)) : 0;
  for (let i = 0; i < across; i++) {
    const x = block.x + (i - (across - 1) / 2) * step;
    pins.push([x, block.z - block.d / 2 - PIN_OFFSET], [x, block.z + block.d / 2 + PIN_OFFSET]);
  }
  return pins;
}

/** Low-profile SMD gold pads along each chip's long horizontal edges, clear of left/right traces and severity seams. */
export function Pins({ blocks, dark, faded, boot }: { blocks: Block[]; dark: boolean; faded: boolean; boot: { current: number } }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);
  const pins = useMemo(() => blocks.flatMap(pinsOf), [blocks]);
  const pinOpacity = () => (faded ? 0.25 : 0.88) * Math.min(1, 0.35 + boot.current * 0.65);
  useFrame(() => {
    if (material.current) material.current.opacity = pinOpacity();
  });
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    pins.forEach(([x, z], i) => {
      dummy.position.set(x, 0.005, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.08, 0.008, 0.07);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
    });
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
    if (material.current) material.current.opacity = pinOpacity();
    invalidate();
  }, [pins, faded, dark, invalidate]);
  return (
    <instancedMesh key={pins.length} ref={mesh} args={[undefined, undefined, pins.length]} raycast={() => null}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        ref={material}
        color={dark ? '#cfa266' : '#c89b5c'}
        emissive="#593e18"
        emissiveIntensity={dark ? 0.3 : 0.22}
        metalness={0.58}
        roughness={0.3}
        transparent
        opacity={pinOpacity()}
      />
    </instancedMesh>
  );
}

function softTexture(paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  paint(canvas.getContext('2d')!);
  return new CanvasTexture(canvas);
}

/** The soft dark seat under each chip, which grounds it on the board at any camera angle. */
export function ContactShadows({ blocks, dark, boot }: { blocks: Block[]; dark: boolean; boot: { current: number } }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);
  const seat = useMemo(() => softTexture((ctx) => {
    ctx.filter = 'blur(11px)';
    ctx.fillStyle = 'black';
    ctx.fillRect(26, 26, 76, 76);
  }), []);
  useEffect(() => () => seat.dispose(), [seat]);
  const shadowOpacity = () => (dark ? 0.55 : 0.22) * (0.25 + 0.75 * Math.min(1, boot.current * 1.25));
  useFrame(() => { if (material.current) material.current.opacity = shadowOpacity(); });
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    blocks.forEach((block, i) => {
      dummy.position.set(block.x, 0.008, block.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set((block.w + 0.3) * 1.62, (block.d + 0.3) * 1.62, 1);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
    });
    dummy.rotation.set(0, 0, 0);
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
    if (material.current) material.current.opacity = shadowOpacity();
    invalidate();
  }, [blocks, dark, invalidate]);
  return (
    <instancedMesh key={blocks.length} ref={mesh} args={[undefined, undefined, blocks.length]} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={material} map={seat} transparent opacity={shadowOpacity()} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/** Heat bleeding onto the board around medium and worse chips, in the severity colour, once the board is powered. */
export function Heat({ blocks, palette, dark, faded, boot }: { blocks: Block[]; palette: Palette; dark: boolean; faded: boolean; boot: { current: number } }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);
  const spots = useMemo(() => blocks.flatMap((block) => {
    const rated = ratedSeverity(block.node.data.item.severity);
    return rated && rated !== 'low' ? [{ block, rated, ...HEAT[rated] }] : [];
  }), [blocks]);
  const glow = useMemo(() => softTexture((ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(0.75, 'rgba(255,255,255,0.08)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }), []);
  useEffect(() => () => glow.dispose(), [glow]);
  const heatOpacity = () => (dark ? 0.42 : 0.48) * (faded ? 0.25 : 1) * (0.25 + 0.75 * Math.min(1, boot.current * 1.25));
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    spots.forEach(({ block, rated, spread, power }, i) => {
      dummy.position.set(block.x, 0.015, block.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(block.w + spread * 2, block.d + spread * 2, 1);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
      // Additive light fades towards black; printed on paper the same fade has to go towards the paper.
      const tone = palette.color(`--severity-${rated}`);
      node.setColorAt(i, dark ? tone.multiplyScalar(power) : tone.lerp(palette.color('--surface'), 1 - power));
    });
    dummy.rotation.set(0, 0, 0);
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
    if (material.current) material.current.opacity = heatOpacity();
    invalidate();
  }, [spots, palette, dark, faded, invalidate]);
  useFrame(() => {
    if (material.current) material.current.opacity = heatOpacity();
  });
  if (!spots.length) return null;
  return (
    <instancedMesh key={spots.length} ref={mesh} args={[undefined, undefined, spots.length]} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={material} map={glow} transparent opacity={heatOpacity()} blending={dark ? AdditiveBlending : NormalBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}
