import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PartId, SimulatedComponentView } from '@/types/mro'

interface AircraftMroStageProps {
  components: SimulatedComponentView[]
  selectedPartId: PartId
  packagedIds: PartId[]
  exploded: boolean
  xray: boolean
  datasetRef: string
  onSelectPart: (partId: PartId) => void
}

interface PartAssemblyMeta {
  group: THREE.Group
  basePos: THREE.Vector3
  explodeOffset: THREE.Vector3
  focusTarget: THREE.Vector3
  cameraOffset: THREE.Vector3
  materials: THREE.MeshStandardMaterial[]
  labelAnchor: THREE.Vector3
}

function tagPartMeshes(group: THREE.Group, partId: PartId): THREE.MeshStandardMaterial[] {
  const mats: THREE.MeshStandardMaterial[] = []
  group.traverse((obj) => {
    obj.userData.partId = partId
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
      mats.push(obj.material)
    }
  })
  return mats
}

function createTurbofanEngine(side: -1 | 1): { group: THREE.Group; fanGroup: THREE.Group } {
  const group = new THREE.Group()

  const nacelleMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.42,
    roughness: 0.24,
  })
  const lipMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    metalness: 0.75,
    roughness: 0.16,
  })
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.65,
    roughness: 0.32,
  })
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.78,
    roughness: 0.22,
  })

  const nacelle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.24, 0.96, 28, 1, true),
    nacelleMat
  )
  nacelle.rotation.x = Math.PI / 2
  group.add(nacelle)

  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.2, 0.92, 24), coreMat)
  inner.rotation.x = Math.PI / 2
  group.add(inner)

  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.028, 12, 28), lipMat)
  lip.position.z = 0.47
  group.add(lip)

  const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 20), coreMat)
  exhaust.rotation.x = -Math.PI / 2
  exhaust.position.z = -0.6
  group.add(exhaust)

  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.72), nacelleMat)
  pylon.position.set(0, 0.24, -0.08)
  group.add(pylon)

  const fanGroup = new THREE.Group()
  fanGroup.position.z = 0.36
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 16), lipMat)
  spinner.rotation.x = Math.PI / 2
  spinner.position.z = 0.08
  fanGroup.add(spinner)

  const bladeGeo = new THREE.BoxGeometry(0.035, 0.21, 0.012)
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2
    const blade = new THREE.Mesh(bladeGeo, bladeMat)
    blade.position.set(Math.cos(angle) * 0.125, Math.sin(angle) * 0.125, 0)
    blade.rotation.z = angle + Math.PI / 2
    blade.rotation.x = 0.32 * side
    fanGroup.add(blade)
  }
  group.add(fanGroup)

  return { group, fanGroup }
}

function createWingMesh(side: -1 | 1): THREE.Group {
  const group = new THREE.Group()
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.32,
    roughness: 0.26,
  })
  const fairingMat = new THREE.MeshStandardMaterial({
    color: 0x0071e3,
    metalness: 0.35,
    roughness: 0.3,
  })

  const s = side
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.78)
  shape.lineTo(s * 3.45, -0.92)
  shape.lineTo(s * 3.85, -1.25)
  shape.lineTo(s * 3.85, -1.42)
  shape.lineTo(s * 3.15, -1.2)
  shape.lineTo(0, -0.45)
  shape.closePath()

  const wingGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.085,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.015,
    bevelSegments: 2,
  })
  const wingMesh = new THREE.Mesh(wingGeo, wingMat)
  wingMesh.rotation.x = Math.PI / 2
  wingMesh.position.set(s * 0.36, -0.02, 0)
  group.add(wingMesh)

  const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.24), fairingMat)
  winglet.position.set(s * 4.18, 0.08, -1.32)
  winglet.rotation.z = -s * 0.35
  group.add(winglet)

  for (const offset of [0.95, 1.85, 2.65]) {
    const fairing = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.28, 6, 10), fairingMat)
    fairing.rotation.x = Math.PI / 2
    fairing.position.set(s * (0.36 + offset), -0.13, -0.25 - offset * 0.32)
    group.add(fairing)
  }

  return group
}

export function AircraftMroStage({
  components,
  selectedPartId,
  packagedIds,
  exploded,
  xray,
  datasetRef,
  onSelectPart,
}: AircraftMroStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const labelRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const componentsRef = useRef<SimulatedComponentView[]>(components)
  componentsRef.current = components

  const selectedRef = useRef<PartId>(selectedPartId)
  selectedRef.current = selectedPartId

  const explodedRef = useRef<boolean>(exploded)
  explodedRef.current = exploded

  const xrayRef = useRef<boolean>(xray)
  xrayRef.current = xray

  const hoveredRef = useRef<PartId | null>(null)
  const onSelectRef = useRef(onSelectPart)
  onSelectRef.current = onSelectPart

  const [webglUnsupported, setWebglUnsupported] = useState(false)
  const focusApiRef = useRef<((partId: PartId) => void) | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    } catch {
      setWebglUnsupported(true)
      return
    }

    const initW = container.clientWidth || 800
    const initH = container.clientHeight || 600
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(initW, initH)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.06
    container.replaceChildren(renderer.domElement)

    // Bright Apple-Keynote Aerospace CAD Cleanroom Studio
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf2f4f7)
    scene.fog = new THREE.FogExp2(0xf2f4f7, 0.024)

    const camera = new THREE.PerspectiveCamera(38, initW / initH, 0.1, 80)
    camera.position.set(5.4, 2.7, 5.4)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.minDistance = 3.0
    controls.maxDistance = 13.5
    controls.maxPolarAngle = Math.PI * 0.52

    let tweenCamPos: THREE.Vector3 | null = null
    let tweenTarget: THREE.Vector3 | null = null
    const stopTween = () => {
      tweenCamPos = null
      tweenTarget = null
    }
    controls.addEventListener('start', stopTween)

    // Soft Daylight Cleanroom 3-Point Studio Lighting
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.45))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.55)
    keyLight.position.set(7, 10, 6)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.9)
    fillLight.position.set(-7, 5, -5)
    scene.add(fillLight)

    // Architectural Light CAD Floor Grid & Contact Disc
    const grid = new THREE.GridHelper(24, 36, 0xcbd5e1, 0xe2e8f0)
    grid.position.y = -1.22
    scene.add(grid)

    const ringGeo = new THREE.RingGeometry(4.35, 4.42, 72)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x0071e3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
    })
    const hangarRing = new THREE.Mesh(ringGeo, ringMat)
    hangarRing.rotation.x = -Math.PI / 2
    hangarRing.position.y = -1.21
    scene.add(hangarRing)

    const aircraftRoot = new THREE.Group()
    scene.add(aircraftRoot)

    const assemblies = new Map<PartId, PartAssemblyMeta>()
    const fanSpinners: THREE.Group[] = []

    // 1. FUSELAGE_CABIN
    const fuselageGroup = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.22,
      roughness: 0.26,
    })
    const bellyMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.35,
      roughness: 0.35,
    })
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x051766,
      metalness: 0.25,
      roughness: 0.3,
    })
    const cabinTube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 4.5, 36), bodyMat)
    cabinTube.rotation.x = Math.PI / 2
    fuselageGroup.add(cabinTube)

    const bellyFairing = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.24, 1.8), bellyMat)
    bellyFairing.position.set(0, -0.32, 0.1)
    fuselageGroup.add(bellyFairing)

    const liveryStripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.428, 0.428, 4.45, 36, 1, true, 0, Math.PI * 2),
      stripeMat
    )
    liveryStripe.rotation.x = Math.PI / 2
    liveryStripe.scale.set(1, 0.06, 1)
    liveryStripe.position.y = 0.08
    fuselageGroup.add(liveryStripe)

    aircraftRoot.add(fuselageGroup)
    assemblies.set('FUSELAGE_CABIN', {
      group: fuselageGroup,
      basePos: new THREE.Vector3(0, 0, 0),
      explodeOffset: new THREE.Vector3(0, 0.22, 0),
      focusTarget: new THREE.Vector3(0, 0.1, 0.1),
      cameraOffset: new THREE.Vector3(4.8, 2.2, 4.2),
      materials: tagPartMeshes(fuselageGroup, 'FUSELAGE_CABIN'),
      labelAnchor: new THREE.Vector3(0, 0.62, 0.35),
    })

    // 2. NOSE_RADOME
    const noseGroup = new THREE.Group()
    const noseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.22,
      roughness: 0.24,
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.12,
    })
    const noseCone = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      noseMat
    )
    noseCone.rotation.x = Math.PI / 2
    noseCone.scale.set(1, 2.3, 1)
    noseCone.position.set(0, -0.02, 2.24)
    noseGroup.add(noseCone)

    const cockpitGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.38, 0.24, 20, 1, false, -0.9, 1.8),
      glassMat
    )
    cockpitGlass.position.set(0, 0.16, 2.45)
    cockpitGlass.rotation.x = 0.45
    noseGroup.add(cockpitGlass)

    aircraftRoot.add(noseGroup)
    assemblies.set('NOSE_RADOME', {
      group: noseGroup,
      basePos: new THREE.Vector3(0, 0, 0),
      explodeOffset: new THREE.Vector3(0, 0, 0.95),
      focusTarget: new THREE.Vector3(0, 0.05, 2.75),
      cameraOffset: new THREE.Vector3(3.1, 1.5, 4.8),
      materials: tagPartMeshes(noseGroup, 'NOSE_RADOME'),
      labelAnchor: new THREE.Vector3(0, 0.45, 2.95),
    })

    // 3. WING_L & 4. WING_R
    const wingLGroup = createWingMesh(-1)
    aircraftRoot.add(wingLGroup)
    assemblies.set('WING_L', {
      group: wingLGroup,
      basePos: new THREE.Vector3(0, 0, 0),
      explodeOffset: new THREE.Vector3(-1.05, 0.12, 0),
      focusTarget: new THREE.Vector3(-2.3, 0, -0.35),
      cameraOffset: new THREE.Vector3(-5.5, 2.8, 3.4),
      materials: tagPartMeshes(wingLGroup, 'WING_L'),
      labelAnchor: new THREE.Vector3(-2.6, 0.3, -0.4),
    })

    const wingRGroup = createWingMesh(1)
    aircraftRoot.add(wingRGroup)
    assemblies.set('WING_R', {
      group: wingRGroup,
      basePos: new THREE.Vector3(0, 0, 0),
      explodeOffset: new THREE.Vector3(1.05, 0.12, 0),
      focusTarget: new THREE.Vector3(2.3, 0, -0.35),
      cameraOffset: new THREE.Vector3(5.5, 2.8, 3.4),
      materials: tagPartMeshes(wingRGroup, 'WING_R'),
      labelAnchor: new THREE.Vector3(2.6, 0.3, -0.4),
    })

    // 5. ENG_L & 6. ENG_R
    const engL = createTurbofanEngine(-1)
    engL.group.position.set(-1.42, -0.34, 0.35)
    aircraftRoot.add(engL.group)
    fanSpinners.push(engL.fanGroup)
    assemblies.set('ENG_L', {
      group: engL.group,
      basePos: new THREE.Vector3(-1.42, -0.34, 0.35),
      explodeOffset: new THREE.Vector3(-0.95, -0.48, 0.45),
      focusTarget: new THREE.Vector3(-1.42, -0.34, 0.35),
      cameraOffset: new THREE.Vector3(-3.8, 1.1, 3.4),
      materials: tagPartMeshes(engL.group, 'ENG_L'),
      labelAnchor: new THREE.Vector3(-1.42, -0.75, 0.55),
    })

    const engR = createTurbofanEngine(1)
    engR.group.position.set(1.42, -0.34, 0.35)
    aircraftRoot.add(engR.group)
    fanSpinners.push(engR.fanGroup)
    assemblies.set('ENG_R', {
      group: engR.group,
      basePos: new THREE.Vector3(1.42, -0.34, 0.35),
      explodeOffset: new THREE.Vector3(0.95, -0.48, 0.45),
      focusTarget: new THREE.Vector3(1.42, -0.34, 0.35),
      cameraOffset: new THREE.Vector3(3.8, 1.1, 3.4),
      materials: tagPartMeshes(engR.group, 'ENG_R'),
      labelAnchor: new THREE.Vector3(1.42, -0.75, 0.55),
    })

    // 7. LANDING_GEAR
    const gearGroup = new THREE.Group()
    const strutMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.72,
      roughness: 0.24,
    })
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1d1d1f,
      metalness: 0.15,
      roughness: 0.85,
    })
    const addGearBogie = (x: number, z: number, wheelCount: number) => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.62, 14), strutMat)
      strut.position.set(x, -0.74, z)
      gearGroup.add(strut)
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 12), strutMat)
      axle.rotation.z = Math.PI / 2
      axle.position.set(x, -1.04, z)
      gearGroup.add(axle)
      const offsets = wheelCount === 4 ? [-0.14, 0.14] : [0]
      for (const dz of offsets) {
        for (const dx of [-0.12, 0.12]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 20), tireMat)
          wheel.rotation.z = Math.PI / 2
          wheel.position.set(x + dx, -1.05, z + dz)
          gearGroup.add(wheel)
        }
      }
    }
    addGearBogie(0, 2.05, 2)
    addGearBogie(-0.66, -0.25, 4)
    addGearBogie(0.66, -0.25, 4)
    aircraftRoot.add(gearGroup)
    assemblies.set('LANDING_GEAR', {
      group: gearGroup,
      basePos: new THREE.Vector3(0, 0, 0),
      explodeOffset: new THREE.Vector3(0, -0.58, 0),
      focusTarget: new THREE.Vector3(0, -0.88, 0.2),
      cameraOffset: new THREE.Vector3(3.8, 0.45, 3.2),
      materials: tagPartMeshes(gearGroup, 'LANDING_GEAR'),
      labelAnchor: new THREE.Vector3(0.66, -1.12, -0.25),
    })

    // 8. TAIL_APU
    const tailGroup = new THREE.Group()
    const tailBodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.22,
      roughness: 0.26,
    })
    const tailFinMat = new THREE.MeshStandardMaterial({
      color: 0x051766,
      metalness: 0.3,
      roughness: 0.28,
    })
    const apuMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.78,
      roughness: 0.25,
    })
    const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.42, 1.45, 32), tailBodyMat)
    tailCone.rotation.x = -Math.PI / 2
    tailCone.position.set(0, 0.06, -2.96)
    tailGroup.add(tailCone)

    const finShape = new THREE.Shape()
    finShape.moveTo(-2.15, 0.28)
    finShape.lineTo(-3.18, 1.65)
    finShape.lineTo(-3.62, 1.65)
    finShape.lineTo(-3.36, 0.22)
    finShape.closePath()
    const vFin = new THREE.Mesh(
      new THREE.ExtrudeGeometry(finShape, {
        depth: 0.09,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.012,
      }),
      tailFinMat
    )
    vFin.rotation.y = -Math.PI / 2
    vFin.position.set(0.045, 0, 0)
    tailGroup.add(vFin)

    const hShape = new THREE.Shape()
    hShape.moveTo(0, -2.55)
    hShape.lineTo(1.42, -3.28)
    hShape.lineTo(1.42, -3.52)
    hShape.lineTo(0, -3.22)
    hShape.lineTo(-1.42, -3.52)
    hShape.lineTo(-1.42, -3.28)
    hShape.closePath()
    const hStab = new THREE.Mesh(
      new THREE.ExtrudeGeometry(hShape, { depth: 0.055, bevelEnabled: false }),
      tailBodyMat
    )
    hStab.rotation.x = Math.PI / 2
    hStab.position.set(0, 0.14, 0)
    tailGroup.add(hStab)

    const apuNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 18), apuMat)
    apuNozzle.rotation.x = Math.PI / 2
    apuNozzle.position.set(0, 0.12, -3.72)
    tailGroup.add(apuNozzle)

    aircraftRoot.add(tailGroup)
    assemblies.set('TAIL_APU', {
      group: tailGroup,
      basePos: new THREE.Vector3(0, 0, 0),
      explodeOffset: new THREE.Vector3(0, 0.22, -1.05),
      focusTarget: new THREE.Vector3(0, 0.65, -3.05),
      cameraOffset: new THREE.Vector3(4.2, 2.2, -5.2),
      materials: tagPartMeshes(tailGroup, 'TAIL_APU'),
      labelAnchor: new THREE.Vector3(0, 1.85, -3.35),
    })

    // Raycaster for direct 3D part click & hover
    const raycaster = new THREE.Raycaster()
    const pointerNdc = new THREE.Vector2()
    let downX = 0
    let downY = 0

    const pickPartAtEvent = (ev: PointerEvent): PartId | null => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointerNdc, camera)
      const hits = raycaster.intersectObjects(aircraftRoot.children, true)
      for (const hit of hits) {
        const pid = hit.object.userData.partId as PartId | undefined
        if (pid) return pid
      }
      return null
    }

    const handlePointerDown = (ev: PointerEvent) => {
      downX = ev.clientX
      downY = ev.clientY
    }

    const handlePointerUp = (ev: PointerEvent) => {
      const moved = Math.hypot(ev.clientX - downX, ev.clientY - downY)
      if (moved > 6) return
      const pid = pickPartAtEvent(ev)
      if (pid) onSelectRef.current(pid)
    }

    const handlePointerMove = (ev: PointerEvent) => {
      const pid = pickPartAtEvent(ev)
      hoveredRef.current = pid
      renderer.domElement.style.cursor = pid ? 'pointer' : 'grab'
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)

    focusApiRef.current = (partId: PartId) => {
      const meta = assemblies.get(partId)
      if (!meta) return
      const offset = explodedRef.current ? meta.explodeOffset : new THREE.Vector3()
      tweenTarget = meta.focusTarget.clone().add(offset)
      tweenCamPos = meta.cameraOffset.clone().add(offset.clone().multiplyScalar(0.5))
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return
      const w = container.clientWidth || 800
      const h = container.clientHeight || 600
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    resizeObserver.observe(container)

    let rafId = 0
    let lastTime = performance.now()
    const tempTargetPos = new THREE.Vector3()
    const tempProj = new THREE.Vector3()
    const colorCritical = new THREE.Color(0xff3b30)
    const colorWatch = new THREE.Color(0xd97706)
    const colorSelected = new THREE.Color(0x0071e3)
    const colorHover = new THREE.Color(0x3b82f6)
    const colorBlack = new THREE.Color(0x000000)

    const animate = (now: number) => {
      rafId = window.requestAnimationFrame(animate)
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now

      for (const fan of fanSpinners) {
        fan.rotation.z += dt * 4.5
      }

      if (tweenCamPos && tweenTarget) {
        camera.position.lerp(tweenCamPos, 0.075)
        controls.target.lerp(tweenTarget, 0.085)
        if (
          camera.position.distanceTo(tweenCamPos) < 0.04 &&
          controls.target.distanceTo(tweenTarget) < 0.04
        ) {
          tweenCamPos = null
          tweenTarget = null
        }
      }

      controls.update()

      const pulse = 0.35 + Math.sin(now * 0.005) * 0.2
      const compMap = new Map(componentsRef.current.map((c) => [c.partId, c]))
      const w = container.clientWidth || 800
      const h = container.clientHeight || 600

      for (const [partId, meta] of assemblies.entries()) {
        tempTargetPos.copy(meta.basePos)
        if (explodedRef.current) {
          tempTargetPos.add(meta.explodeOffset)
        }
        meta.group.position.lerp(tempTargetPos, 0.09)

        const comp = compMap.get(partId)
        const isSelected = selectedRef.current === partId
        const isHovered = hoveredRef.current === partId
        let emissiveColor = colorBlack
        let emissiveIntensity = 0

        if (comp?.simStatus === 'CRITICAL') {
          emissiveColor = colorCritical
          emissiveIntensity = isSelected ? 0.55 : pulse
        } else if (comp?.simStatus === 'WATCH') {
          emissiveColor = colorWatch
          emissiveIntensity = isSelected ? 0.4 : 0.18
        } else if (isSelected) {
          emissiveColor = colorSelected
          emissiveIntensity = 0.28
        } else if (isHovered) {
          emissiveColor = colorHover
          emissiveIntensity = 0.18
        }

        for (const mat of meta.materials) {
          mat.wireframe = xrayRef.current
          mat.emissive.copy(emissiveColor)
          mat.emissiveIntensity = emissiveIntensity
        }

        const el = labelRefs.current[partId]
        if (el) {
          tempProj.copy(meta.labelAnchor).add(meta.group.position).sub(meta.basePos)
          tempProj.project(camera)
          if (tempProj.z < 1) {
            const px = (tempProj.x * 0.5 + 0.5) * w
            const py = (-tempProj.y * 0.5 + 0.5) * h
            el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -100%)`
            el.style.opacity = '1'
            el.style.pointerEvents = 'auto'
          } else {
            el.style.opacity = '0'
            el.style.pointerEvents = 'none'
          }
        }
      }

      renderer.render(scene, camera)
    }

    rafId = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      controls.removeEventListener('start', stopTween)
      controls.dispose()
      ringGeo.dispose()
      ringMat.dispose()
      renderer.dispose()
      focusApiRef.current = null
    }
  }, [])

  useEffect(() => {
    focusApiRef.current?.(selectedPartId)
  }, [selectedPartId])

  if (webglUnsupported) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#F2F4F7] text-sm text-[#515154]">
        3D WebGL 환경을 초기화하지 못했습니다. 좌측 부품 목록에서 정비 상태를 확인할 수 있습니다.
      </div>
    )
  }

  return (
    <div className="relative h-full w-full select-none bg-[#F2F4F7]">
      <div ref={containerRef} className="h-full w-full" />

      {/* 3D-Projected Clean Daylight CAD Callout Tags */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {components.map((comp) => {
          const isSelected = comp.partId === selectedPartId
          const isPackaged = packagedIds.includes(comp.partId) && !comp.replaced
          const isCritical = comp.simStatus === 'CRITICAL'
          const isWatch = comp.simStatus === 'WATCH'
          return (
            <button
              key={comp.partId}
              ref={(el) => {
                labelRefs.current[comp.partId] = el
              }}
              type="button"
              onClick={() => onSelectPart(comp.partId)}
              style={{ opacity: 0 }}
              className={`absolute top-0 left-0 flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium shadow-[0_6px_18px_rgba(0,0,0,0.08)] backdrop-blur-md transition-colors ${
                isSelected
                  ? 'bg-[#0071E3] text-white'
                  : isCritical
                    ? 'bg-[#FF3B30] text-white'
                    : isPackaged
                      ? 'bg-[#051766] text-white'
                      : isWatch
                        ? 'bg-white/95 text-[#B45309] hover:bg-white'
                        : 'bg-white/88 text-[#1D1D1F] hover:bg-white'
              }`}
            >
              <span>{comp.nameKo.split('(')[0].split('·')[0].trim()}</span>
              <span className="font-mono opacity-85 tabular-nums">
                {Math.round(comp.simWearPct)}%
              </span>
              {isPackaged && <span className="text-[10px] opacity-90">· 묶음</span>}
            </button>
          )
        })}
      </div>

      {/* Quiet Bottom-Left Viewport Hint & BigQuery Source */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#515154]">
        <span>드래그: 회전 · 스크롤: 확대 · 부품 클릭: 상세 점검</span>
        <span className="font-mono text-[#86868B]">BigQuery {datasetRef}</span>
      </div>
    </div>
  )
}
