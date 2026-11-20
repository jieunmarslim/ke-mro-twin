import { Grid2X2, Layers, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FLEET_AIRCRAFT, type AircraftReg } from '@/types/mro'

const HANGAR_SLOTS = [
  { label: '8h 단기', hours: 8 },
  { label: '16h 야간', hours: 16 },
  { label: '36h C-Check', hours: 36 },
]

const CYCLE_PRESETS = [
  { label: '현재', cycles: 0 },
  { label: '+250 FC', cycles: 250 },
  { label: '+500 FC', cycles: 500 },
]

interface TopMroHudProps {
  aircraftReg: AircraftReg
  hangarHours: number
  cyclesAdded: number
  exploded: boolean
  xray: boolean
  onSelectAircraft: (reg: AircraftReg) => void
  onSelectHangarHours: (hours: number) => void
  onSelectCycles: (cycles: number) => void
  onToggleExploded: () => void
  onToggleXray: () => void
  onResetSimulation: () => void
}

export function TopMroHud({
  aircraftReg,
  hangarHours,
  cyclesAdded,
  exploded,
  xray,
  onSelectAircraft,
  onSelectHangarHours,
  onSelectCycles,
  onToggleExploded,
  onToggleXray,
  onResetSimulation,
}: TopMroHudProps) {
  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-black/[0.06] bg-white/85 px-4 backdrop-blur-xl sm:px-5">
      {/* Left: Brand & Fleet Aircraft Switcher */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="hidden text-xs font-bold tracking-[0.14em] text-[#051766] xl:inline">
          KOREAN AIR MRO
        </span>

        <div
          role="group"
          aria-label="기단 기체 선택"
          className="flex items-center gap-0.5 rounded-lg bg-[#F2F2F7] p-1"
        >
          {FLEET_AIRCRAFT.map((ac) => {
            const isActive = ac.reg === aircraftReg
            return (
              <button
                key={ac.reg}
                type="button"
                onClick={() => onSelectAircraft(ac.reg)}
                className={`cursor-pointer rounded-[6px] px-2.5 py-1 font-mono text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow] ${
                  isActive
                    ? 'bg-white text-[#1D1D1F] shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
                    : 'text-[#515154] hover:text-[#1D1D1F]'
                }`}
              >
                {ac.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Center: Hangar Slot + Cycle Horizon Segmented Controls */}
      <div className="hidden items-center gap-2 md:flex">
        <div
          role="group"
          aria-label="격납고 가용 시간"
          className="flex items-center gap-0.5 rounded-lg bg-[#F2F2F7] p-1"
        >
          {HANGAR_SLOTS.map((slot) => {
            const isActive = hangarHours === slot.hours
            return (
              <button
                key={slot.hours}
                type="button"
                onClick={() => onSelectHangarHours(slot.hours)}
                className={`cursor-pointer rounded-[6px] px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow] ${
                  isActive
                    ? 'bg-white text-[#1D1D1F] shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
                    : 'text-[#515154] hover:text-[#1D1D1F]'
                }`}
              >
                {slot.label}
              </button>
            )
          })}
        </div>

        <div
          role="group"
          aria-label="예측 비행 사이클"
          className="flex items-center gap-0.5 rounded-lg bg-[#F2F2F7] p-1"
        >
          {CYCLE_PRESETS.map((preset) => {
            const isActive = cyclesAdded === preset.cycles
            return (
              <button
                key={preset.cycles}
                type="button"
                onClick={() => onSelectCycles(preset.cycles)}
                className={`cursor-pointer rounded-[6px] px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow] ${
                  isActive
                    ? 'bg-white text-[#1D1D1F] shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
                    : 'text-[#515154] hover:text-[#1D1D1F]'
                }`}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: 3D CAD View Controls */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="xs"
          variant={exploded ? 'default' : 'secondary'}
          onClick={onToggleExploded}
          className="min-w-[80px]"
        >
          <span className="no-shift-stack">
            <span className={`inline-flex items-center gap-1.5 ${exploded ? 'visible' : 'invisible'}`}>
              <Layers className="size-3.5" />
              조립 뷰
            </span>
            <span className={`inline-flex items-center gap-1.5 ${exploded ? 'invisible' : 'visible'}`}>
              <Layers className="size-3.5" />
              분해 뷰
            </span>
          </span>
        </Button>

        <Button
          type="button"
          size="xs"
          variant={xray ? 'default' : 'secondary'}
          onClick={onToggleXray}
          className="hidden min-w-[74px] sm:inline-flex"
        >
          <Grid2X2 className="size-3.5" />
          <span>X-Ray</span>
        </Button>

        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onResetSimulation}
          aria-label="시뮬레이션 초기화"
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
    </header>
  )
}
