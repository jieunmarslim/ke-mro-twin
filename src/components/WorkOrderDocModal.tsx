import { useEffect } from 'react'
import { Download, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import type { AircraftReg, SimulatedComponentView } from '@/types/mro'

export interface WorkOrderDocument {
  orderId: string
  issuedAt: string
  aircraftReg: AircraftReg
  routeContext: string
  hangarHours: number
  cyclesAdded: number
  items: SimulatedComponentView[]
  aiSummary: string
}

interface WorkOrderDocModalProps {
  doc: WorkOrderDocument | null
  onClose: () => void
}

function buildMarkdownContent(doc: WorkOrderDocument): string {
  const totalHours = doc.items.reduce((s, i) => s + i.leadTimeHours, 0)
  const totalCostManwon = Math.round(
    doc.items.reduce((s, i) => s + i.replacementCostKrw, 0) / 10000
  )
  const rows = doc.items
    .map(
      (item, idx) =>
        `| ${String(idx + 1).padStart(2, '0')} | ${item.ataChapter} | ${item.nameKo} (${item.serialNumber}) | ${item.simWearPct.toFixed(1)}% | ${item.leadTimeHours}h | ${item.stockIcnHangar}기 | ${Math.round(item.replacementCostKrw / 10000).toLocaleString()}만원 |`
    )
    .join('\n')

  return [
    `# KOREAN AIR MRO 정비 작업지시서 (${doc.orderId})`,
    '',
    `- **발행 일시**: ${doc.issuedAt}`,
    `- **대상 기체**: Boeing 787-10 (${doc.aircraftReg}) · ${doc.routeContext}`,
    `- **격납고 가용 시간**: ${doc.hangarHours}시간 (총 예상 소요: ${totalHours}시간)`,
    `- **예상 자재비 합계**: ${totalCostManwon.toLocaleString()}만원`,
    '',
    '## 1. 정비 권고 요약 (gemini-4-hydrogen)',
    doc.aiSummary,
    '',
    '## 2. 교체 대상 부품 목록',
    '| No | ATA | 부품명 (S/N) | 마모도 | 소요 | 인천 재고 | 예상 비용 |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: |',
    rows,
    '',
    '## 3. 작업 확인 및 서명',
    '- 담당 정비사: ___________________ (인)',
    '- 품질 검사관(QA): _______________ (인)',
  ].join('\n')
}

export function WorkOrderDocModal({ doc, onClose }: WorkOrderDocModalProps) {
  useBodyScrollLock(Boolean(doc))

  useEffect(() => {
    if (!doc) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [doc, onClose])

  if (!doc) return null

  const totalHours = doc.items.reduce((s, i) => s + i.leadTimeHours, 0)
  const totalCostManwon = Math.round(
    doc.items.reduce((s, i) => s + i.replacementCostKrw, 0) / 10000
  )
  const lowStockItems = doc.items.filter((i) => i.stockIcnHangar <= 1)

  const handleDownloadMd = () => {
    const md = buildMarkdownContent(doc)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.orderId}_${doc.aircraftReg}_work_order.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wo-doc-title"
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/40 p-4 backdrop-blur-sm sm:p-8 print:static print:bg-white print:p-0"
    >
      <div className="flex min-h-full items-center justify-center print:block">
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl rounded-[20px] bg-white text-[#1D1D1F] shadow-[0_24px_60px_rgba(0,0,0,0.16)] print:max-w-none print:rounded-none print:shadow-none"
        >
          {/* Modal Action Bar (hidden when printing) */}
          <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-6 py-4 print:hidden">
            <div className="text-sm font-semibold text-[#1D1D1F]">
              정비 작업지시서 문서 미리 보기
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="xs" variant="secondary" onClick={handleDownloadMd}>
                <Download className="size-3.5" />
                <span>문서 다운로드 (.md)</span>
              </Button>
              <Button type="button" size="xs" variant="default" onClick={() => window.print()}>
                <Printer className="size-3.5" />
                <span>인쇄 / PDF 저장</span>
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={onClose}
                aria-label="닫기"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Printable Official Work Order Sheet */}
          <article className="space-y-6 p-7 sm:p-8">
            <header className="flex items-start justify-between gap-4 border-b border-black/[0.08] pb-5">
              <div>
                <div className="text-[11px] font-bold tracking-[0.16em] text-[#051766]">
                  KOREAN AIR MAINTENANCE &amp; ENGINEERING
                </div>
                <h2 id="wo-doc-title" className="mt-1 text-2xl font-bold tracking-tight text-[#1D1D1F]">
                  정비 작업지시서 (Work Order)
                </h2>
              </div>
              <div className="text-right font-mono text-xs text-[#515154] tabular-nums">
                <div className="text-sm font-bold text-[#1D1D1F]">{doc.orderId}</div>
                <div className="mt-0.5">{doc.issuedAt}</div>
              </div>
            </header>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-4 rounded-xl bg-[#F5F5F7] p-4 text-xs sm:grid-cols-4">
              <div>
                <div className="text-[#86868B]">대상 기체</div>
                <div className="mt-1 font-mono text-sm font-semibold text-[#1D1D1F]">
                  {doc.aircraftReg}
                </div>
                <div className="text-[11px] text-[#515154]">Boeing 787-10</div>
              </div>
              <div>
                <div className="text-[#86868B]">입고 구분</div>
                <div className="mt-1 text-sm font-semibold text-[#1D1D1F]">{doc.routeContext}</div>
                <div className="text-[11px] text-[#515154]">
                  예측 +{doc.cyclesAdded} FC 기준
                </div>
              </div>
              <div>
                <div className="text-[#86868B]">소요 / 가용 시간</div>
                <div
                  className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                    totalHours > doc.hangarHours ? 'text-[#FF3B30]' : 'text-[#1D1D1F]'
                  }`}
                >
                  {totalHours}h / {doc.hangarHours}h
                </div>
                <div className="text-[11px] text-[#515154]">인천 T2 격납고</div>
              </div>
              <div>
                <div className="text-[#86868B]">예상 자재비</div>
                <div className="mt-1 font-mono text-sm font-semibold text-[#0071E3] tabular-nums">
                  {totalCostManwon.toLocaleString()}만원
                </div>
                <div className="text-[11px] text-[#515154]">총 {doc.items.length}개 부품</div>
              </div>
            </div>

            {/* AI Engineering Summary */}
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold text-[#515154]">
                01. 정비 판단 요약 (gemini-4-hydrogen)
              </h3>
              <p className="text-[13px] leading-[1.65] text-[#1D1D1F]">{doc.aiSummary}</p>
              {lowStockItems.length > 0 && (
                <p className="text-xs font-medium text-[#B45309]">
                  자재팀 발주 알림: {lowStockItems.map((i) => i.nameKo).join(', ')} 인천 격납고 잔여 재고 1기.
                </p>
              )}
            </section>

            {/* Parts Table */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-[#515154]">
                02. 교체 대상 부품 및 자재 출고 목록
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.08] text-[#86868B]">
                      <th className="py-2 pr-3 font-medium">ATA</th>
                      <th className="py-2 pr-3 font-medium">부품명 · 시리얼</th>
                      <th className="py-2 pr-3 text-right font-medium">마모도</th>
                      <th className="py-2 pr-3 text-right font-medium">소요</th>
                      <th className="py-2 pr-3 text-right font-medium">재고</th>
                      <th className="py-2 text-right font-medium">예상 비용</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06] tabular-nums">
                    {doc.items.map((item) => (
                      <tr key={item.partId}>
                        <td className="py-2.5 pr-3 font-mono text-[#515154]">{item.ataChapter}</td>
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-[#1D1D1F]">{item.nameKo}</div>
                          <div className="font-mono text-[11px] text-[#86868B]">
                            {item.serialNumber}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono font-semibold text-[#1D1D1F]">
                          {item.simWearPct.toFixed(1)}%
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-[#515154]">
                          {item.leadTimeHours}h
                        </td>
                        <td
                          className={`py-2.5 pr-3 text-right font-mono ${
                            item.stockIcnHangar <= 1 ? 'font-semibold text-[#FF3B30]' : 'text-[#515154]'
                          }`}
                        >
                          {item.stockIcnHangar}기
                        </td>
                        <td className="py-2.5 text-right font-mono text-[#1D1D1F]">
                          {Math.round(item.replacementCostKrw / 10000).toLocaleString()}만원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Sign-off Footer */}
            <footer className="grid grid-cols-2 gap-6 border-t border-black/[0.08] pt-5 text-xs text-[#515154]">
              <div className="space-y-3">
                <div>담당 정비사 확인 (서명)</div>
                <div className="h-6 border-b border-black/20" />
              </div>
              <div className="space-y-3">
                <div>품질 검사관 QA 승인 (서명)</div>
                <div className="h-6 border-b border-black/20" />
              </div>
            </footer>
          </article>
        </div>
      </div>
    </div>
  )
}
