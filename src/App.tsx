import { useEffect, useMemo, useState } from 'react'
import { AircraftMroStage } from '@/components/mro/AircraftMroStage'
import { PartAssemblyTree } from '@/components/PartAssemblyTree'
import { PartInspectorPanel } from '@/components/PartInspectorPanel'
import { TopMroHud } from '@/components/TopMroHud'
import {
  FLEET_AIRCRAFT,
  type AircraftComponentData,
  type AircraftReg,
  type MroComponentsResponse,
  type MroInsightResponse,
  type MroReplaceResponse,
  type PartHealthStatus,
  type PartId,
  type SimulatedComponentView,
} from '@/types/mro'

function deriveStatus(wearPct: number): PartHealthStatus {
  if (wearPct >= 90) return 'CRITICAL'
  if (wearPct >= 75) return 'WATCH'
  return 'NORMAL'
}

function buildAutoPackage(
  components: SimulatedComponentView[],
  hangarHours: number
): PartId[] {
  const candidates = [...components]
    .filter((c) => !c.replaced && c.simWearPct >= 75)
    .sort((a, b) => b.simWearPct - a.simWearPct)

  const picked: PartId[] = []
  let usedHours = 0
  for (const c of candidates) {
    if (usedHours + c.leadTimeHours <= hangarHours) {
      picked.push(c.partId)
      usedHours += c.leadTimeHours
    }
  }
  return picked
}

export function App() {
  const [aircraftReg, setAircraftReg] = useState<AircraftReg>('HL8515')
  const [hangarHours, setHangarHours] = useState<number>(16)
  const [rawComponents, setRawComponents] = useState<AircraftComponentData[]>([])
  const [datasetRef, setDatasetRef] = useState<string>('ke_mro_twin')

  const [selectedPartId, setSelectedPartId] = useState<PartId>('LANDING_GEAR')
  const [cyclesAdded, setCyclesAdded] = useState<number>(0)
  const [exploded, setExploded] = useState<boolean>(false)
  const [xray, setXray] = useState<boolean>(false)

  const [replacedByReg, setReplacedByReg] = useState<Record<string, Record<string, boolean>>>({})
  const [packagedByReg, setPackagedByReg] = useState<Record<string, PartId[]>>({})

  const [insightData, setInsightData] = useState<MroInsightResponse | null>(null)
  const [insightLoading, setInsightLoading] = useState<boolean>(false)
  const [replacing, setReplacing] = useState<boolean>(false)
  const [submittingPackage, setSubmittingPackage] = useState<boolean>(false)
  const [orderMessageByPart, setOrderMessageByPart] = useState<Record<string, string>>({})
  const [packageOrderMsg, setPackageOrderMsg] = useState<string | null>(null)

  const fleetInfo =
    FLEET_AIRCRAFT.find((f) => f.reg === aircraftReg) || FLEET_AIRCRAFT[0]

  useEffect(() => {
    let cancelled = false
    setPackageOrderMsg(null)
    fetch(`/api/mro/components?aircraftReg=${encodeURIComponent(aircraftReg)}`)
      .then((res) => (res.ok ? (res.json() as Promise<MroComponentsResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return
        setRawComponents(data.components)
        setDatasetRef(data.datasetRef)
        if (data.components[0]) {
          setSelectedPartId(data.components[0].partId)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [aircraftReg])

  const replacedForCurrent = useMemo(
    () => replacedByReg[aircraftReg] || {},
    [replacedByReg, aircraftReg]
  )

  const simulatedComponents: SimulatedComponentView[] = useMemo(() => {
    return rawComponents.map((comp) => {
      const replaced = Boolean(replacedForCurrent[comp.partId])
      const simCycles = replaced ? 0 : comp.flightCycles + cyclesAdded
      const simWearPct = replaced
        ? 0
        : Math.min(100, Number(((simCycles / comp.limitCycles) * 100).toFixed(1)))
      const remainingCycles = Math.max(0, comp.limitCycles - simCycles)
      return {
        ...comp,
        simCycles,
        simWearPct,
        simStatus: deriveStatus(simWearPct),
        remainingCycles,
        replaced,
      }
    })
  }, [rawComponents, cyclesAdded, replacedForCurrent])

  // Auto-seed an optimal package when an aircraft loads for the first time
  useEffect(() => {
    if (simulatedComponents.length === 0) return
    setPackagedByReg((prev) => {
      if (prev[aircraftReg]) return prev
      return {
        ...prev,
        [aircraftReg]: buildAutoPackage(simulatedComponents, hangarHours),
      }
    })
  }, [aircraftReg, simulatedComponents, hangarHours])

  const packagedIds = packagedByReg[aircraftReg] || []
  const selectedComponent =
    simulatedComponents.find((c) => c.partId === selectedPartId) || simulatedComponents[0] || null
  const isSelectedReplaced = Boolean(replacedForCurrent[selectedPartId])

  useEffect(() => {
    if (!selectedPartId || rawComponents.length === 0) return
    let cancelled = false
    setInsightLoading(true)

    const params = new URLSearchParams({
      aircraftReg,
      partId: selectedPartId,
      cyclesAdded: String(cyclesAdded),
      hangarHours: String(hangarHours),
      replaced: isSelectedReplaced ? '1' : '0',
    })

    fetch(`/api/mro/insight?${params.toString()}`)
      .then((res) => (res.ok ? (res.json() as Promise<MroInsightResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return
        setInsightData(data)
      })
      .catch(() => {
        if (!cancelled) setInsightData(null)
      })
      .finally(() => {
        if (!cancelled) setInsightLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [aircraftReg, selectedPartId, cyclesAdded, hangarHours, isSelectedReplaced, rawComponents.length])

  const handleSelectAircraft = (reg: AircraftReg) => {
    setAircraftReg(reg)
    const info = FLEET_AIRCRAFT.find((f) => f.reg === reg)
    if (info) setHangarHours(info.defaultHangarHours)
  }

  const handleTogglePackage = (partId: PartId) => {
    setPackageOrderMsg(null)
    setPackagedByReg((prev) => {
      const current = prev[aircraftReg] || []
      const exists = current.includes(partId)
      return {
        ...prev,
        [aircraftReg]: exists ? current.filter((id) => id !== partId) : [...current, partId],
      }
    })
  }

  const handleAutoPack = () => {
    setPackageOrderMsg(null)
    setPackagedByReg((prev) => ({
      ...prev,
      [aircraftReg]: buildAutoPackage(simulatedComponents, hangarHours),
    }))
  }

  const handleReplaceSingle = async () => {
    if (!selectedComponent || replacing) return
    setReplacing(true)
    try {
      const resp = await fetch('/api/mro/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraftReg,
          partIds: [selectedComponent.partId],
          cyclesAdded,
        }),
      })
      if (resp.ok) {
        const result = (await resp.json()) as MroReplaceResponse
        setReplacedByReg((prev) => ({
          ...prev,
          [aircraftReg]: { ...(prev[aircraftReg] || {}), [selectedComponent.partId]: true },
        }))
        setPackagedByReg((prev) => ({
          ...prev,
          [aircraftReg]: (prev[aircraftReg] || []).filter((id) => id !== selectedComponent.partId),
        }))
        setOrderMessageByPart((prev) => ({
          ...prev,
          [`${aircraftReg}:${selectedComponent.partId}`]: result.loggedToBigQuery
            ? `작업지시 ${result.orderId}가 BigQuery에 기록되었습니다.`
            : `작업지시 ${result.orderId} 시뮬레이션이 완료되었습니다.`,
        }))
      }
    } finally {
      setReplacing(false)
    }
  }

  const handleExecutePackage = async () => {
    const activeIds = packagedIds.filter((id) => !replacedForCurrent[id])
    if (activeIds.length === 0 || submittingPackage) return
    setSubmittingPackage(true)
    try {
      const resp = await fetch('/api/mro/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraftReg,
          partIds: activeIds,
          cyclesAdded,
        }),
      })
      if (resp.ok) {
        const result = (await resp.json()) as MroReplaceResponse
        setReplacedByReg((prev) => {
          const nextForReg = { ...(prev[aircraftReg] || {}) }
          for (const id of activeIds) nextForReg[id] = true
          return { ...prev, [aircraftReg]: nextForReg }
        })
        setPackagedByReg((prev) => ({ ...prev, [aircraftReg]: [] }))
        setPackageOrderMsg(
          result.loggedToBigQuery
            ? `묶음 작업지시 ${result.orderId} (${activeIds.length}건)가 BigQuery에 기록되었습니다.`
            : `묶음 작업지시 ${result.orderId} (${activeIds.length}건) 시뮬레이션 완료.`
        )
      }
    } finally {
      setSubmittingPackage(false)
    }
  }

  const handleResetSimulation = () => {
    setCyclesAdded(0)
    setExploded(false)
    setXray(false)
    setReplacedByReg((prev) => ({ ...prev, [aircraftReg]: {} }))
    setPackagedByReg((prev) => {
      const next = { ...prev }
      delete next[aircraftReg]
      return next
    })
    setOrderMessageByPart({})
    setPackageOrderMsg(null)
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F5F5F7] text-[#1D1D1F]">
      <TopMroHud
        aircraftReg={aircraftReg}
        hangarHours={hangarHours}
        cyclesAdded={cyclesAdded}
        exploded={exploded}
        xray={xray}
        onSelectAircraft={handleSelectAircraft}
        onSelectHangarHours={setHangarHours}
        onSelectCycles={setCyclesAdded}
        onToggleExploded={() => setExploded((prev) => !prev)}
        onToggleXray={() => setXray((prev) => !prev)}
        onResetSimulation={handleResetSimulation}
      />

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PartAssemblyTree
          aircraftReg={aircraftReg}
          routeContext={fleetInfo.routeContext}
          components={simulatedComponents}
          selectedPartId={selectedPartId}
          packagedIds={packagedIds}
          hangarHours={hangarHours}
          submittingPackage={submittingPackage}
          packageOrderMsg={packageOrderMsg}
          onSelectPart={setSelectedPartId}
          onTogglePackage={handleTogglePackage}
          onAutoPack={handleAutoPack}
          onExecutePackage={handleExecutePackage}
        />

        <section className="relative min-h-0 flex-1">
          <AircraftMroStage
            components={simulatedComponents}
            selectedPartId={selectedPartId}
            packagedIds={packagedIds}
            exploded={exploded}
            xray={xray}
            datasetRef={datasetRef}
            onSelectPart={setSelectedPartId}
          />
        </section>

        {selectedComponent && (
          <PartInspectorPanel
            component={selectedComponent}
            isPackaged={packagedIds.includes(selectedComponent.partId) && !selectedComponent.replaced}
            hangarHours={hangarHours}
            insightData={insightData}
            insightLoading={insightLoading}
            replacing={replacing}
            lastOrderMessage={orderMessageByPart[`${aircraftReg}:${selectedComponent.partId}`] || null}
            onTogglePackage={() => handleTogglePackage(selectedComponent.partId)}
            onReplacePart={handleReplaceSingle}
          />
        )}
      </main>
    </div>
  )
}

export default App
