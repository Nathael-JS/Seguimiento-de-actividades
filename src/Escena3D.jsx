import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'

// Fondo 3D de la portada y del login: el anillo de los turnos (A, B y C, un tercio cada uno) inclinado y girando
// despacio alrededor del dial, con las actividades como puntos en órbita. Sigue un poco al puntero. Es decorativo:
// lo carga Fondo3D (Login.jsx) solo en pantallas anchas, con WebGL y sin "reducir movimiento"
const color = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#3cc2b8'
const TERCIO = (Math.PI * 2) / 3

function Anillo({ x, y, escala }) {
  const grupo = useRef()
  const puntos = useRef()
  const colores = useMemo(() => ['--turno-a', '--turno-b', '--turno-c'].map(color), [])
  // 60 actividades en órbitas un poco distintas alrededor del anillo
  const orbita = useMemo(() => Array.from({ length: 60 }, (_, i) => ({
    r: 1.85 + ((i * 37) % 10) / 20, fase: (i / 60) * Math.PI * 2, vel: 0.08 + ((i * 13) % 7) / 90, y: (((i * 29) % 9) - 4) / 18,
  })), [])
  const posiciones = useMemo(() => new Float32Array(orbita.length * 3), [orbita])

  useFrame(({ clock, pointer }, dt) => {
    const t = clock.elapsedTime
    const g = grupo.current
    g.rotation.z += dt * 0.06
    // inclinación base + un poco hacia el puntero, suavizado
    g.rotation.x += (0.95 + pointer.y * 0.12 - g.rotation.x) * 0.04
    g.rotation.y += (-0.3 + pointer.x * 0.15 - g.rotation.y) * 0.04
    orbita.forEach((o, i) => {
      const a = o.fase + t * o.vel
      posiciones.set([Math.cos(a) * o.r, Math.sin(a) * o.r, o.y + Math.sin(t * 0.6 + i) * 0.05], i * 3)
    })
    puntos.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <group ref={grupo} position={[x, y, -0.5]} scale={escala}>
      {colores.map((c, i) => (
        <mesh key={c} rotation={[0, 0, i * TERCIO]}>
          {/* cada turno es un tercio del anillo, con un pequeño hueco entre turnos */}
          <torusGeometry args={[1.7, 0.045, 24, 96, TERCIO - 0.12]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.25} roughness={0.4} metalness={0.2} transparent opacity={0.55} />
        </mesh>
      ))}
      <mesh>
        <torusGeometry args={[2.05, 0.008, 8, 160]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} />
      </mesh>
      <points ref={puntos}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[posiciones, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#e6f4f2" size={0.03} transparent opacity={0.6} sizeAttenuation />
      </points>
    </group>
  )
}

// x, y, escala: dónde queda el centro del anillo (unidades de la escena; ~4 de ancho a cada lado en la portada),
// alrededor del dial de cada pantalla
export default function Escena3D({ x = 0, y = 0, escala = 1 }) {
  return (
    <Canvas className="escena-3d" aria-hidden="true" dpr={[1, 1.75]} camera={{ position: [0, 0, 6], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[4, 3, 5]} intensity={40} />
      <Anillo x={x} y={y} escala={escala} />
    </Canvas>
  )
}
