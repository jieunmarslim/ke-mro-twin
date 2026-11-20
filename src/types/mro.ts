export type AircraftReg = 'HL8515' | 'HL8516' | 'HL8517'

export interface FleetAircraftInfo {
  reg: AircraftReg
  label: string
  routeContext: string
  defaultHangarHours: number
}

export const FLEET_AIRCRAFT: FleetAircraftInfo[] = [
  { reg: 'HL8515', label: 'HL8515', routeContext: '인천 야간 기항', defaultHangarHours: 16 },
  { reg: 'HL8516', label: 'HL8516', routeContext: '미주 노선 복귀', defaultHangarHours: 8 },
  { reg: 'HL8517', label: 'HL8517', routeContext: '정기 C-Check 입고', defaultHangarHours: 36 },
]

export type PartId =
  | 'ENG_L'
  | 'ENG_R'
  | 'LANDING_GEAR'
  | 'WING_L'
  | 'WING_R'
  | 'NOSE_RADOME'
  | 'FUSELAGE_CABIN'
  | 'TAIL_APU'

export type PartHealthStatus = 'NORMAL' | 'WATCH' | 'CRITICAL'

export interface SensorPoint {
  checkSeq: number
  checkLabel: string
  wearPct: number
  tempC: number
  vibrationIps: number
}

export interface AircraftComponentData {
  partId: PartId
  aircraftReg: string
  ataChapter: string
  nameKo: string
  subsystem: string
  serialNumber: string
  flightHours: number
  flightCycles: number
  limitCycles: number
  wearPct: number
  tempC: number
  vibrationIps: number
  status: PartHealthStatus
  lastCheckDate: string
  leadTimeHours: number
  stockIcnHangar: number
  replacementCostKrw: number
  maintenanceNote: string
  history: SensorPoint[]
}

export interface SimulatedComponentView extends AircraftComponentData {
  simCycles: number
  simWearPct: number
  simStatus: PartHealthStatus
  remainingCycles: number
  replaced: boolean
}

export interface MroComponentsResponse {
  aircraftReg: string
  aircraftModel: string
  datasetRef: string
  dataSource: 'bigquery_live' | 'snapshot_fallback'
  components: AircraftComponentData[]
}

export interface MroInsightResponse {
  partId: PartId
  model: 'gemini-4-hydrogen'
  source: 'live_gemini_api' | 'baseline_brief'
  insight: string
}

export interface MroReplaceResponse {
  ok: boolean
  orderId: string
  aircraftReg: AircraftReg
  partIds: PartId[]
  loggedToBigQuery: boolean
}
