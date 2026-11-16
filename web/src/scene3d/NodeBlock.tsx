import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Line, RoundedBox } from '@react-three/drei';
import type { Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial } from 'three';
import { cardKey, cardTexture } from './card-texture';
import { UNIT, ratedSeverity, roundedRectPoints, type Block } from './model';
import { nodeToken, type Palette } from './palette';

type BlockProps = {
  block: Block; palette: Palette; dark: boolean; font: string; textureScale: number;
  selected: boolean; muted: boolean; muteOpacity: number; hovered: boolean; neighbor: boolean;
  current: boolean; fresh: boolean; motion: boolean;
  /** When this chip powers on, 0–1, against the board's boot clock. */
  depth: number;
  boot: { current: number };
  onHover: (id: string, active: boolean) => void;
  onSelect: (id: string) => void;
};

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** A card as a packaged chip soldered to the board: as tall as its severity, the 2D card printed on its lid. */
export function NodeBlock({ block, palette, dark, font, textureScale, selected, muted, muteOpacity, hovered, neighbor, current, fresh, motion, depth, boot, onHover, onSelect }: BlockProps) {
  const { item, compact } = block.node.data;
  const group = useRef<Group>(null);
  const chassis = useRef<Group>(null);
  const lid = useRef<Mesh>(null);
  const topRingGroup = useRef<Group>(null);
  const body = useRef<MeshPhysicalMaterial>(null);
  const seamMaterial = useRef<MeshBasicMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);
  const flashUntil = useRef(0);
  const freshStartedAt = useRef(0);
  const seated = useRef(!motion);
  const hue = useMemo(() => palette.color(nodeToken(item.type)), [palette, item.type]);
  const severity = ratedSeverity(item.severity);
  const W = block.w * UNIT, D = block.d * UNIT;
  const texture = useMemo(
    () => cardTexture(item, W, D, Boolean(compact), current, dark, palette, font, textureScale),
    [cardKey(item), W, D, compact, current, dark, palette, font, textureScale],
  );
  useEffect(() => () => texture.dispose(), [texture]);

  const topOutline = useMemo(() => roundedRectPoints(block.w + 0.03, block.d + 0.03, 0.06, 0), [block.w, block.d]);
  const baseOutline = useMemo(() => roundedRectPoints(block.w + 0.06, block.d + 0.06, 0.07, 0.012), [block.w, block.d]);
  const side = dark ? '#171d21' : '#eef0f4';
  const seam = useMemo(() => {
    if (severity === 'critical' || severity === 'high') return palette.color(`--severity-${severity}`).multiplyScalar(dark ? 2.2 : 0.95);
    if (severity === 'medium') return palette.color('--severity-medium').multiplyScalar(dark ? 1.1 : 0.72);
    return null;
  }, [palette, severity, dark]);

  const outlineColor = useMemo(() => {
    const tone = selected ? palette.color('--ink') : current ? palette.color('--live') : hue.clone();
    return dark && (selected || current || hovered) ? tone.multiplyScalar(1.45) : tone;
  }, [palette, selected, current, hovered, hue, dark]);

  const targetLift = selected ? 0.05 : hovered ? 0.12 : 0;

  useLayoutEffect(() => {
    if (!motion) {
      flashUntil.current = 0;
      seated.current = true;
      if (group.current) group.current.position.y = targetLift;
      if (chassis.current) chassis.current.scale.y = 1;
      if (lid.current) lid.current.position.y = block.height + 0.003;
      if (topRingGroup.current) topRingGroup.current.position.y = block.height + 0.006;
      if (body.current) body.current.emissiveIntensity = 0;
      if (seam && seamMaterial.current) seamMaterial.current.color.copy(seam).multiplyScalar(severity === 'medium' ? 0.75 : 1);
    }
    invalidate();
  }, [block, texture, side, seam, severity, motion, muted, muteOpacity, selected, current, hovered, neighbor, targetLift, invalidate]);

  // A chip the Agent just wrote rises smoothly from its seat and flashes once.
  useLayoutEffect(() => {
    if (!motion) { flashUntil.current = 0; freshStartedAt.current = 0; return; }
    if (!fresh) return;
    const now = performance.now();
    freshStartedAt.current = now;
    flashUntil.current = now + 1400;
  }, [fresh, motion]);

  useFrame((state, delta) => {
    if (!motion) return;
    const node = group.current;
    if (!node) return;
    if (boot.current < 0.05) seated.current = false;
    const arrive = boot.current >= 1 ? 1 : easeOut((boot.current - depth * 0.45) / 0.55);
    if (arrive > 0.2 && !seated.current) {
      seated.current = true;
      if (boot.current < 1) flashUntil.current = performance.now() + 550;
    }
    const freshElapsed = freshStartedAt.current ? (performance.now() - freshStartedAt.current) / 1000 : 1;
    const freshK = freshElapsed < 0.7 ? easeOut(freshElapsed / 0.7) : 1;
    const scaleY = Math.max(0.18, arrive * freshK);
    if (chassis.current) chassis.current.scale.y = scaleY;
    if (lid.current) lid.current.position.y = block.height * scaleY + 0.003;
    if (topRingGroup.current) topRingGroup.current.position.y = block.height * scaleY + 0.006;
    node.position.y += (targetLift - node.position.y) * Math.min(1, delta * 12);

    if (seam && seamMaterial.current) {
      if (severity === 'critical' || severity === 'high') {
        const breath = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * (severity === 'critical' ? 2.2 : 1.4));
        seamMaterial.current.color.copy(seam).multiplyScalar(0.6 + 0.7 * breath);
      } else {
        seamMaterial.current.color.copy(seam).multiplyScalar(0.75);
      }
    }
    if (body.current) {
      const flash = Math.max(0, (flashUntil.current - performance.now()) / 1000);
      body.current.emissiveIntensity = flash * (dark ? 1.2 : 0.25) * (muted ? 0.25 : 1);
    }
  });

  const over = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(block.id, true);
    document.body.style.cursor = 'pointer';
  };
  const out = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(block.id, false);
    document.body.style.cursor = '';
  };
  useEffect(() => () => { document.body.style.cursor = ''; }, []);
  const opacity = muted ? muteOpacity : 1;
  const showOutline = selected || current || hovered || neighbor;
  const outlineWidth = selected ? 2.2 : hovered || current ? 1.8 : 1.2;
  const outlineOpacity = neighbor && !selected && !current && !hovered ? 0.65 : 0.95;

  return (
    <group ref={group} position={[block.x, motion ? 0 : targetLift, block.z]}>
      <group ref={chassis}>
        <RoundedBox
          args={[block.w, block.height, block.d]}
          radius={0.045}
          smoothness={3}
          position-y={block.height / 2}
          castShadow
          receiveShadow
          onClick={(event) => { event.stopPropagation(); onSelect(block.id); }}
          onPointerOver={over}
          onPointerOut={out}
        >
          {/* Always transparent: three compiles the blend mode once, so toggling it on selection would not take effect. */}
          <meshPhysicalMaterial
            ref={body}
            color={side}
            emissive={hue}
            emissiveIntensity={0}
            roughness={dark ? 0.36 : 0.44}
            metalness={dark ? 0.32 : 0.08}
            clearcoat={dark ? 0.55 : 0.25}
            clearcoatRoughness={0.3}
            transparent
            opacity={opacity}
            depthWrite={!muted || muteOpacity > 0.5}
          />
        </RoundedBox>
        {seam && !muted && (
          <mesh position-y={0.02} raycast={() => null}>
            <boxGeometry args={[block.w + 0.022, 0.02, block.d + 0.022]} />
            <meshBasicMaterial ref={seamMaterial} color={seam} transparent toneMapped={false} />
          </mesh>
        )}
      </group>
      <mesh ref={lid} rotation-x={-Math.PI / 2} position-y={block.height + 0.003} raycast={() => null}>
        <planeGeometry args={[block.w - 0.06, block.d - 0.06]} />
        {/* Lit by its own emission, so the print keeps the card's colours under any light; the lacquer still reflects. */}
        <meshStandardMaterial
          color="#000000"
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={hovered || selected ? 1.06 : 0.98}
          roughness={0.48}
          metalness={0}
          transparent
          opacity={opacity}
          depthWrite={!muted || muteOpacity > 0.5}
          toneMapped={false}
        />
      </mesh>
      {showOutline && (
        <>
          <group ref={topRingGroup} position-y={block.height + 0.006}>
            <Line points={topOutline} color={outlineColor} lineWidth={outlineWidth} transparent opacity={outlineOpacity} toneMapped={false} raycast={() => null} />
          </group>
          <Line points={baseOutline} color={outlineColor} lineWidth={outlineWidth * 0.85} transparent opacity={outlineOpacity * 0.85} toneMapped={false} raycast={() => null} />
        </>
      )}
    </group>
  );
}
