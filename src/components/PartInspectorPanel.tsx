import { Check, Plus, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import type { MroInsightResponse, SimulatedComponentView } from '@/types/mro'

interface PartInspectorPanelProps {
  component: SimulatedComponentView
  isPackaged: boolean
  hangarHours: number
  insightData: MroInsightResponse | null
  insightLoading: boolean
  replacing: boolean
  lastOrderMessage: string | null
  onTogglePackage: () => void
  onReplacePart: () => void
}

function statusMeta(status: SimulatedComponentView['simStatus']): {
  text: string
  colorClass: string
  bgClass: string
} {
  if (status === 'CRITICAL') {
    return {
      text: '교체 필요',
      colorClass: 'text-[#FF3B30]',
      bgClass: 'bg-[rgba(255,59,48,0.08)]',
    }
  }
  if (status === 'WATCH') {
    return {
      text: '점검 주의',
      colorClass: 'text-[#B45309]',
      bgClass: 'bg-[rgba(217,119,6,0.10)]',
    }
  }
  return {
    text: '정상 운항',
    colorClass: 'text-[#0071E3]',
    bgClass: 'bg-[rgba(0,113,227,0.08)]',
  }
}

export function PartInspectorPanel({
  component,
  isPackaged,
  hangarHours,
  insightData,
  insightLoading,
  replacing,
  lastOrderMessage,
  onTogglePackage,
  onReplacePart,
}: PartInspectorPanelProps) {
  const statusInfo = statusMeta(component.simStatus)
  const costManwon = Math.round(component.replacementCostKrw / 10000).toLocaleString()
  const exceedsSlot = component.leadTimeHours > hangarHours

  return (
    <aside className="no-scrollbar flex max-h-[46vh] w-full shrink-0 flex-col gap-5 overflow-y-auto border-t border-black/[0.06] bg-white p-6 lg:max-h-none lg:w-[388px] lg:border-t-0 lg:border-l">
      {/* 1. Selected Part Identity & Wear Gauge */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-mono text-[#86868B]">
            {component.ataChapter} · {component.serialNumber}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 font-medium tabular-nums ${statusInfo.bgClass} ${statusInfo.colorClass}`}
          >
            {statusInfo.text} · {component.simWearPct.toFixed(1)}%
          </span>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#1D1D1F]">
            {component.nameKo}
          </h2>
          <p className="mt-1 text-[13px] text-[#515154]">{component.subsystem}</p>
        </div>

        <div className="space-y-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#F2F2F7]">
            <div
              style={{ width: `${Math.min(100, Math.max(2, component.simWearPct))}%` }}
              className={`h-full rounded-full transition-all duration-300 ${
                component.simStatus === 'CRITICAL'
                  ? 'bg-[#FF3B30]'
                  : component.simStatus === 'WATCH'
                    ? 'bg-[#D97706]'
                    : 'bg-[#0071E3]'
              }`}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-[#86868B] tabular-nums">
            <span>누적 {component.simCycles.toLocaleString()} FC</span>
            <span>
              잔여 {component.remainingCycles.toLocaleString()} / {component.limitCycles.toLocaleString()} FC
            </span>
          </div>
        </div>

        {/* Top gemini-4-hydrogen MRO Packaging Insight */}
        <div className="space-y-1.5 rounded-xl bg-[#F5F5F7] px-4 py-3.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#1D1D1F]">정비 판단 인사이트</span>
            <span className="font-mono text-[11px] text-[#86868B]">
              {insightData?.source === 'live_gemini_api'
                ? 'gemini-4-hydrogen'
                : 'gemini-4-hydrogen · 기본 요약'}
            </span>
          </div>
          {insightLoading && !insightData ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <p className="text-[13px] leading-[1.65] text-[#1D1D1F]">
              {insightData?.insight || component.maintenanceNote}
            </p>
          )}
        </div>
      </div>

      <Separator className="bg-black/[0.06]" />

      {/* 2. BigQuery Telemetry & 6-Month Sensor Trend */}
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-[#86868B]">작동 온도</div>
            <div className="mt-1 font-mono text-lg font-semibold text-[#1D1D1F] tabular-nums">
              {component.replaced ? Math.round(component.tempC * 0.92) : component.tempC}°C
            </div>
          </div>

          <div>
            <div className="text-xs text-[#86868B]">진동 (IPS)</div>
            <div className="mt-1 font-mono text-lg font-semibold text-[#0071E3] tabular-nums">
              {component.replaced ? '0.12' : component.vibrationIps.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="text-xs text-[#86868B]">인천 재고</div>
            <div
              className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
                component.stockIcnHangar <= 1 ? 'text-[#FF3B30]' : 'text-[#1D1D1F]'
              }`}
            >
              {component.stockIcnHangar}기
            </div>
          </div>
        </div>

        {component.history.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#86868B]">
              <span>최근 6개월 마모 추이</span>
              <span className="font-mono tabular-nums">최근 점검 {component.lastCheckDate}</span>
            </div>
            <div className="flex h-12 items-end gap-2">
              {component.history.map((pt, idx) => {
                const isLatest = idx === component.history.length - 1
                const barVal = isLatest ? component.simWearPct : pt.wearPct
                return (
                  <div key={pt.checkSeq} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-8 w-full items-end">
                      <div
                        style={{ height: `${Math.max(12, Math.min(100, barVal))}%` }}
                        className={`w-full rounded-t-[4px] transition-all duration-300 ${
                          isLatest
                            ? component.simStatus === 'CRITICAL'
                              ? 'bg-[#FF3B30]'
                              : component.simStatus === 'WATCH'
                                ? 'bg-[#D97706]'
                                : 'bg-[#0071E3]'
                            : 'bg-[#D1D1D6]'
                        }`}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-[#86868B] tabular-nums">
                      {pt.checkLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <Separator className="bg-black/[0.06]" />

      {/* 3. Package Toggle & Direct Replacement Action */}
      <div className="mt-auto space-y-2.5">
        <div className="flex items-center justify-between text-[13px] tabular-nums">
          <span className={exceedsSlot ? 'font-medium text-[#FF3B30]' : 'text-[#515154]'}>
            소요 {component.leadTimeHours}시간 {exceedsSlot ? `(가용 ${hangarHours}h 초과)` : ''}
          </span>
          <span className="text-[#515154]">비용 {costManwon}만원</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="default"
            variant={isPackaged ? 'default' : 'secondary'}
            disabled={component.replaced}
            onClick={onTogglePackage}
            className="rounded-xl"
          >
            {isPackaged ? (
              <>
                <Check className="size-4" />
                <span>묶음에 담김</span>
              </>
            ) : (
              <>
                <Plus className="size-4" />
                <span>정비 묶음 담기</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            size="default"
            variant="secondary"
            disabled={replacing || component.replaced}
            onClick={onReplacePart}
            className="rounded-xl"
          >
            <Wrench className="size-4" />
            <span>{component.replaced ? '교체 완료' : replacing ? '기록 중...' : '단독 교체'}</span>
          </Button>
        </div>

        {lastOrderMessage && (
          <p className="text-xs text-[#0071E3] tabular-nums">{lastOrderMessage}</p>
        )}
      </div>
    </aside>
  )
}
