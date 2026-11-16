import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, DoubleSide, Object3D, ShaderMaterial, type InstancedMesh, type MeshStandardMaterial } from 'three';
import { GOLD, ribbonStrip, traceArrowhead, touches, type Link, type Zone } from './model';
import { relationToken, type Palette } from './palette';

/** Half the strip's width: room for the glow; the copper itself is a narrow core down its middle. */
const HALF = 0.16;
const ARROW_LENGTH = 0.26;
const ARROW_HALF_WIDTH = 0.09;
/** On a dense board only every third trace carries a signal until a selection or hover names the ones that matter. */
const DENSE_SIGNAL_EVERY = 3;
const dummy = new Object3D();

const vertexShader = /* glsl */ `
attribute vec4 aTrace;
attribute vec3 aColor;
attribute vec4 aStyle;
varying vec4 vTrace;
varying vec3 vColor;
varying vec4 vStyle;
void main() {
  vTrace = aTrace;
  vColor = aColor;
  vStyle = aStyle;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// vTrace: distance along the relation's direction, side (-1..1), total length, phase.
// vStyle: pattern (-1 for a solid direction arrow), signal, opacity, depth.
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uBoot;
uniform float uBoost;
uniform float uHalo;
uniform float uSignal;
uniform float uCore;
varying vec4 vTrace;
varying vec3 vColor;
varying vec4 vStyle;
const float TAIL = 1.5;
void main() {
  float flow = vTrace.x, across = abs(vTrace.y), total = max(vTrace.z, 0.001);
  float pixel = max(fwidth(vTrace.y), 1e-4);
  float width = max(uCore, pixel * 0.8);
  float core = 1.0 - smoothstep(width, width + pixel * 1.2, across);
  bool arrow = vStyle.x < -0.5;
  if (arrow) core = 1.0;
  if (vStyle.x > 1.5) core *= step(fract(flow / 0.18), 0.35);
  else if (vStyle.x > 0.5) core *= step(fract(flow / 0.36), 0.6);
  float edge = clamp(1.0 - across, 0.0, 1.0);
  float halo = arrow ? 0.0 : exp(-across * across * 10.0) * edge;
  float x = mod(uTime * 2.4 + vTrace.w * (total + TAIL), total + TAIL) - flow;
  float signal = x >= 0.0 && x < TAIL ? 1.0 - x / TAIL : 0.0;
  signal *= signal * vStyle.y * uSignal;
  float arrive = vStyle.w * 0.8 + flow / total * 0.2;
  float on = mix(0.28, 1.0, smoothstep(arrive, arrive + 0.04, uBoot));
  float front = uBoot < 1.0 ? (1.0 - smoothstep(0.0, 0.07, abs(uBoot - arrive))) : 0.0;
  vec3 color = vColor * (1.0 + (signal + front) * uBoost);
  float alpha = (core * vStyle.z + halo * (uHalo * vStyle.z + (signal + front) * 0.75)) * on;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}`;

function ViaPads({ links, palette, dark, focusId, boot }: { links: Link[]; palette: Palette; dark: boolean; focusId: string | null; boot: { current: number } }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);
  const pads = useMemo(() => {
    const active = focusId ? links.filter((link) => touches(link, focusId)) : links;
    return active.flatMap((link) => {
      if (link.points.length < 2) return [];
      return [
        { pt: link.points[0], group: link.group },
        { pt: link.points[link.points.length - 1], group: link.group },
      ];
    });
  }, [links, focusId]);

  const viaOpacity = () => (0.35 + 0.65 * Math.min(1, boot.current * 1.4)) * (dark ? 0.92 : 0.88);
  useFrame(() => {
    if (material.current) material.current.opacity = viaOpacity();
  });

  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    const gold = palette.color(GOLD);
    pads.forEach(({ pt, group }, i) => {
      dummy.position.set(pt[0], 0.032, pt[2]);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
      node.setColorAt(i, palette.color(relationToken(group)).lerp(gold, 0.35));
    });
    dummy.rotation.set(0, 0, 0);
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
    if (material.current) material.current.opacity = viaOpacity();
    invalidate();
  }, [pads, palette, dark, invalidate]);

  if (!pads.length) return null;
  return (
    <instancedMesh key={pads.length} ref={mesh} args={[undefined, undefined, pads.length]} raycast={() => null}>
      <ringGeometry args={[0.032, 0.068, 20]} />
      <meshStandardMaterial ref={material} color="#ffffff" metalness={0.55} roughness={0.3} side={DoubleSide} transparent opacity={viaOpacity()} />
    </instancedMesh>
  );
}

type TraceProps = { links: Link[]; palette: Palette; dark: boolean; dense: boolean; focusId: string | null; hardFocus: boolean; depths: ReadonlyMap<string, number>; boot: { current: number }; motion: boolean };

/**
 * Every relation as one lit strip of copper, via pads and a permanent direction arrow in the family colour,
 * all in batched draws. Signals and the boot current live in the shader. 反驳 stays dashed and 取代 dotted;
 * arrows stay solid even without motion.
 */
export function Traces({ links, palette, dark, dense, focusId, hardFocus, depths, boot, motion }: TraceProps) {
  const geometry = useMemo(() => {
    const positions: number[] = [], trace: number[] = [], colors: number[] = [], styles: number[] = [], index: number[] = [];
    links.forEach((link, i) => {
      const strip = ribbonStrip(link.points, HALF);
      const active = touches(link, focusId);
      const color = palette.color(relationToken(link.group));
      const pattern = link.group === 'replace' ? 2 : link.group === 'oppose' ? 1 : 0;
      const signal = (focusId ? active : !dense || i % DENSE_SIGNAL_EVERY === 0) ? 1 : 0;
      const opacity = focusId ? (active ? 1 : hardFocus ? 0.08 : 0.2) : dense ? (dark ? 0.55 : 0.8) : 0.92;
      const depth = Math.min(depths.get(link.source) ?? 1, depths.get(link.target) ?? 1);
      const base = positions.length / 3;
      positions.push(...strip.positions);
      strip.along.forEach((along, k) => {
        trace.push(link.reversed ? strip.length - along : along, strip.side[k], strip.length, (i * 0.618) % 1);
        colors.push(color.r, color.g, color.b);
        styles.push(pattern, signal, opacity, depth);
      });
      for (let k = 0; k < strip.along.length / 2 - 1; k++) {
        const a = base + k * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const arrow = traceArrowhead(link.points, link.reversed, ARROW_LENGTH, ARROW_HALF_WIDTH);
      if (arrow) {
        const arrowBase = positions.length / 3;
        positions.push(...arrow.positions);
        for (const setback of arrow.setbacks) {
          trace.push(strip.length - setback, 0, strip.length, (i * 0.618) % 1);
          colors.push(color.r, color.g, color.b);
          styles.push(-1, signal, opacity, depth);
        }
        index.push(arrowBase, arrowBase + 1, arrowBase + 2);
      }
    });
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    result.setAttribute('aTrace', new BufferAttribute(new Float32Array(trace), 4));
    result.setAttribute('aColor', new BufferAttribute(new Float32Array(colors), 3));
    result.setAttribute('aStyle', new BufferAttribute(new Float32Array(styles), 4));
    result.setIndex(index);
    return result;
  }, [links, palette, dark, dense, focusId, hardFocus, depths]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uBoot: { value: boot.current >= 1 ? 2 : boot.current },
      uBoost: { value: dark ? 3.8 : 1.15 },
      uHalo: { value: dark ? 0.24 : 0.11 },
      uCore: { value: dark ? 0.16 : 0.21 },
      uSignal: { value: motion ? 1 : 0 },
    },
    transparent: true, depthWrite: false,
  }), [dark, motion]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uBoot.value = boot.current >= 1 ? 2 : boot.current;
  });
  if (!links.length) return null;
  return (
    <>
      <mesh geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />
      <ViaPads links={links} palette={palette} dark={dark} focusId={focusId} boot={boot} />
    </>
  );
}

/** Overview groups: a border printed on the board; the group's name is drawn with the labels. */
export function ZoneOutline({ zone, palette }: { zone: Zone; palette: Palette }) {
  const tint = palette.css(zone.color || '--ink-3');
  const points = useMemo(() => {
    const l = zone.x - zone.w / 2, r = zone.x + zone.w / 2, t = zone.z - zone.d / 2, b = zone.z + zone.d / 2;
    return [[l, 0.02, t], [r, 0.02, t], [r, 0.02, b], [l, 0.02, b], [l, 0.02, t]] as [number, number, number][];
  }, [zone.x, zone.z, zone.w, zone.d]);
  return <Line points={points} color={tint} lineWidth={1.4} transparent opacity={0.7} toneMapped={false} raycast={() => null} />;
}
