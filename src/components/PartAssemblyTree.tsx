import { Check, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PartId, SimulatedComponentView } from '@/types/mro'

interface PartAssemblyTreeProps {
  aircraftReg: string
  routeContext: string
  components: SimulatedComponentView[]
  selectedPartId: PartId
  packagedIds: PartId[]
  hangarHours: number
  submittingPackage: boolean
  packageOrderMsg: string | null
  onSelectPart: (partId: PartId) => void
  onTogglePackage: (partId: PartId) => void
  onAutoPack: () => void
  onExecutePackage: () => void
}

export function PartAssemblyTree({
  aircraftReg,
  routeContext,
  components,
  selectedPartId,
  packagedIds,
  hangarHours,
  submittingPackage,
  packageOrderMsg,
  onSelectPart,
  onTogglePackage,
  onAutoPack,
  onExecutePackage,
}: PartAssemblyTreeProps) {
  const packagedSet = new Set(packagedIds)
  const packagedItems = components.filter((c) => packagedSet.has(c.partId) && !c.replaced)
  const totalHours = packagedItems.reduce((sum, c) => sum + c.leadTimeHours, 0)
  const totalCostManwon = Math.round(
    packagedItems.reduce((sum, c) => sum + c.replacementCostKrw, 0) / 10000
  )
  const isOvertime = totalHours > hangarHours
  const lowStockNames = packagedItems
    .filter((c) => c.stockIcnHangar <= 1)
    .map((c) => c.nameKo.split('(')[0].split('·')[0].trim())

  return (
    <aside className="hidden w-[304px] shrink-0 flex-col border-r border-black/[0.06] bg-white lg:flex">
      {/* Header & Auto-Pack Trigger */}
      <div className="space-y-2.5 border-b border-black/[0.06] px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-[#1D1D1F]">
              {aircraftReg} 정비 묶음 계획
            </div>
            <p className="text-[11px] text-[#86868B]">{routeContext} · 가용 {hangarHours}시간</p>
          </div>
          <Button type="button" size="xs" variant="secondary" onClick={onAutoPack}>
            <Sparkles className="size-3 text-[#0071E3]" />
            <span>자동 묶음</span>
          </Button>
        </div>
      </div>

      {/* Scrollable Assembly List with Package Toggle */}
      <div className="no-scrollbar flex-1 space-y-1 overflow-y-auto p-2.5">
        {components.map((comp) => {
          const isSelected = comp.partId === selectedPartId
          const isPackaged = packagedSet.has(comp.partId) && !comp.replaced
          const barColor =
            comp.simStatus === 'CRITICAL'
              ? 'bg-[#FF3B30]'
              : comp.simStatus === 'WATCH'
                ? 'bg-[#D97706]'
                : 'bg-[#0071E3]'
          const pctColor =
            comp.simStatus === 'CRITICAL'
              ? 'text-[#FF3B30]'
              : comp.simStatus === 'WATCH'
                ? 'text-[#B45309]'
                : 'text-[#515154]'

          return (
            <div
              key={comp.partId}
              className={`rounded-xl px-3 py-2.5 transition-colors ${
                isSelected ? 'bg-[rgba(0,113,227,0.08)]' : 'hover:bg-[#F5F5F7]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPart(comp.partId)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-[#86868B]">{comp.ataChapter}</span>
                    <span className={`font-mono font-semibold tabular-nums ${pctColor}`}>
                      {comp.simWearPct.toFixed(1)}%
                    </span>
                    <span className="font-mono text-[#86868B] tabular-nums">
                      {comp.leadTimeHours}h
                    </span>
                    {comp.stockIcnHangar <= 1 && (
                      <span className="font-medium text-[#FF3B30]">재고 1기</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-medium text-[#1D1D1F]">
                    {comp.nameKo}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={comp.replaced}
                  onClick={() => onTogglePackage(comp.partId)}
                  className={`mt-0.5 inline-flex h-7 w-[58px] shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-45 ${
                    isPackaged
                      ? 'bg-[#0071E3] text-white hover:bg-[#0062C4]'
                      : 'bg-[#F2F2F7] text-[#1D1D1F] hover:bg-[#E5E5EA]'
                  }`}
                >
                  {comp.replaced ? (
                    '완료'
                  ) : isPackaged ? (
                    <>
                      <Check className="size-3" />
                      <span>담김</span>
                    </>
                  ) : (
                    <>
                      <Plus className="size-3" />
                      <span>담기</span>
                    </>
                  )}
                </button>
              </div>

              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#E5E5EA]">
                <div
                  style={{ width: `${Math.min(100, Math.max(2, comp.simWearPct))}%` }}
                  className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Sticky Maintenance Package Summary & Batch Execute */}
      <div className="space-y-2.5 border-t border-black/[0.06] bg-[#F5F5F7] p-4">
        <div className="flex items-center justify-between text-xs tabular-nums">
          <span className="font-medium text-[#515154]">선택 부품 {packagedItems.length}건</span>
          <span className={`font-mono font-semibold ${isOvertime ? 'text-[#FF3B30]' : 'text-[#1D1D1F]'}`}>
            {totalHours}h / 가용 {hangarHours}h
          </span>
        </div>

        <div className="flex items-center justify-between text-xs tabular-nums">
          <span className="text-[#86868B]">예상 자재비</span>
          <span className="font-mono font-medium text-[#1D1D1F]">
            {totalCostManwon.toLocaleString()}만원
          </span>
        </div>

        {isOvertime && (
          <p className="text-[11px] text-[#FF3B30]">
            가용 시간을 {totalHours - hangarHours}시간 초과했습니다. 슬롯을 늘리거나 일부 부품을 제외하세요.
          </p>
        )}

        {lowStockNames.length > 0 && (
          <p className="text-[11px] text-[#B45309]">
            인천 격납고 재고 부족 주의: {lowStockNames.join(', ')} (잔여 1기)
          </p>
        )}

        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={packagedItems.length === 0 || submittingPackage}
          onClick={onExecutePackage}
          className="w-full rounded-xl"
        >
          {submittingPackage
            ? '작업지시서 생성 중...'
            : `작업지시서 문서 발행 (${packagedItems.length}건)`}
        </Button>

        {packageOrderMsg && (
          <p className="text-[11px] text-[#0071E3] tabular-nums">{packageOrderMsg}</p>
        )}
      </div>
    </aside>
  )
}
