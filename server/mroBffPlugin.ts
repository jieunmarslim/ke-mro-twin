import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promisify } from 'node:util'
import { loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import { FALLBACK_MRO_COMPONENTS } from './data/mroFallback.ts'
import type {
  AircraftComponentData,
  AircraftReg,
  MroComponentsResponse,
  MroInsightResponse,
  MroReplaceResponse,
  PartHealthStatus,
  PartId,
  SensorPoint,
} from '../src/types/mro.ts'

const execFileAsync = promisify(execFile)

const VALID_AIRCRAFT_REGS = new Set<AircraftReg>(['HL8515', 'HL8516', 'HL8517'])
const VALID_PART_IDS = new Set<PartId>([
  'ENG_L',
  'ENG_R',
  'LANDING_GEAR',
  'WING_L',
  'WING_R',
  'NOSE_RADOME',
  'FUSELAGE_CABIN',
  'TAIL_APU',
])
const SAFE_PROJECT_ID_REGEX = /^[a-z][a-z0-9-]{4,30}$/
const GEMINI_MODEL_ID = 'gemini-4-hydrogen'
const ADC_TOKEN_TTL_MS = 10 * 60_000
const BQ_CACHE_TTL_MS = 2 * 60_000
const INSIGHT_CACHE_TTL_MS = 30 * 60_000

let adcTokenCache: { token: string; expiresAt: number } | null = null
const componentsCache = new Map<AircraftReg, { data: MroComponentsResponse; expiresAt: number }>()
const insightCache = new Map<string, { data: MroInsightResponse; expiresAt: number }>()

async function resolveGcpProjectId(envProject: string): Promise<string> {
  if (SAFE_PROJECT_ID_REGEX.test(envProject)) return envProject
  try {
    const { stdout } = await execFileAsync('gcloud', ['config', 'get-value', 'project'], {
      timeout: 3000,
    })
    const candidate = stdout.trim()
    return SAFE_PROJECT_ID_REGEX.test(candidate) ? candidate : ''
  } catch {
    return ''
  }
}

async function getAdcAccessToken(): Promise<string> {
  if (adcTokenCache && adcTokenCache.expiresAt > Date.now()) {
    return adcTokenCache.token
  }

  if (process.env.K_SERVICE) {
    try {
      const resp = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        {
          headers: { 'Metadata-Flavor': 'Google' },
          signal: AbortSignal.timeout(2000),
        }
      )
      if (resp.ok) {
        const data = (await resp.json()) as { access_token?: string; expires_in?: number }
        if (data.access_token) {
          const ttlMs = Math.max(60_000, ((data.expires_in || 600) - 60) * 1000)
          adcTokenCache = {
            token: data.access_token,
            expiresAt: Date.now() + Math.min(ttlMs, ADC_TOKEN_TTL_MS),
          }
          return data.access_token
        }
      }
    } catch {
      return ''
    }
  }

  try {
    const { stdout } = await execFileAsync(
      'gcloud',
      ['auth', 'application-default', 'print-access-token'],
      { timeout: 4000 }
    )
    const token = stdout.trim()
    if (!token) return ''
    adcTokenCache = { token, expiresAt: Date.now() + ADC_TOKEN_TTL_MS }
    return token
  } catch {
    return ''
  }
}

function applySecurityHeaders(res: ServerResponse, isDev: boolean, isApi: boolean): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (isApi) res.setHeader('Cache-Control', 'no-store')

  const scriptSrc = isDev ? "'self' 'unsafe-inline'" : "'self'"
  const connectSrc = isDev ? "'self' ws://127.0.0.1:* http://127.0.0.1:*" : "'self'"

  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      `connect-src ${connectSrc}`,
      "object-src 'none'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
    ].join('; ')
  )
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function normalizeText(input: string): string {
  return input
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface BqQueryResponse {
  jobComplete?: boolean
  rows?: Array<{ f?: Array<{ v?: string | null }> }>
}

async function runBigQuerySql(
  gcpProject: string,
  token: string,
  query: string,
  queryParameters?: Array<{
    name: string
    parameterType: { type: string }
    parameterValue: { value: string }
  }>
): Promise<BqQueryResponse | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (!process.env.K_SERVICE) {
    headers['x-goog-user-project'] = gcpProject
  }

  const body: Record<string, unknown> = {
    query,
    useLegacySql: false,
    location: 'US',
    timeoutMs: 12000,
  }
  if (queryParameters && queryParameters.length > 0) {
    body.parameterMode = 'NAMED'
    body.queryParameters = queryParameters
  }

  try {
    const resp = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${gcpProject}/queries`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      }
    )
    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '')
      console.error(`[bigquery] HTTP ${resp.status}: ${errTxt.slice(0, 240)}`)
      return null
    }
    return (await resp.json()) as BqQueryResponse
  } catch (err) {
    console.error('[bigquery] request failed:', err instanceof Error ? err.message : 'unknown')
    return null
  }
}

async function fetchComponentsFromBigQuery(
  gcpProject: string,
  aircraftReg: AircraftReg
): Promise<MroComponentsResponse> {
  const datasetRef = gcpProject ? `${gcpProject}.ke_mro_twin` : 'ke_mro_twin'
  const fallback: MroComponentsResponse = {
    aircraftReg,
    aircraftModel: 'Boeing 787-10 Dreamliner',
    datasetRef,
    dataSource: 'snapshot_fallback',
    components: FALLBACK_MRO_COMPONENTS.map((c) => ({ ...c, aircraftReg })),
  }

  if (!gcpProject) return fallback
  const token = await getAdcAccessToken()
  if (!token) return fallback

  const [compRes, histRes] = await Promise.all([
    runBigQuerySql(
      gcpProject,
      token,
      `SELECT part_id, aircraft_reg, ata_chapter, name_ko, subsystem, serial_number,
              flight_hours, flight_cycles, limit_cycles, wear_pct, temp_c, vibration_ips,
              status, CAST(last_check_date AS STRING), lead_time_hours, stock_icn_hangar,
              replacement_cost_krw, maintenance_note
       FROM \`${gcpProject}.ke_mro_twin.aircraft_components\`
       WHERE aircraft_reg = @aircraftReg
       ORDER BY wear_pct DESC`,
      [
        {
          name: 'aircraftReg',
          parameterType: { type: 'STRING' },
          parameterValue: { value: aircraftReg },
        },
      ]
    ),
    runBigQuerySql(
      gcpProject,
      token,
      `SELECT part_id, check_seq, check_label, wear_pct, temp_c, vibration_ips
       FROM \`${gcpProject}.ke_mro_twin.sensor_history\`
       ORDER BY part_id, check_seq ASC`
    ),
  ])

  if (!compRes?.rows || compRes.rows.length === 0) {
    return fallback
  }

  const historyMap = new Map<string, SensorPoint[]>()
  for (const row of histRes?.rows || []) {
    const f = row.f || []
    const pid = String(f[0]?.v || '')
    if (!pid) continue
    const list = historyMap.get(pid) || []
    list.push({
      checkSeq: Number(f[1]?.v || 0),
      checkLabel: String(f[2]?.v || ''),
      wearPct: Number(f[3]?.v || 0),
      tempC: Number(f[4]?.v || 0),
      vibrationIps: Number(f[5]?.v || 0),
    })
    historyMap.set(pid, list)
  }

  const components: AircraftComponentData[] = []
  for (const row of compRes.rows) {
    const f = row.f || []
    const pid = String(f[0]?.v || '') as PartId
    if (!VALID_PART_IDS.has(pid)) continue
    const rawStatus = String(f[12]?.v || 'NORMAL')
    const status: PartHealthStatus =
      rawStatus === 'CRITICAL' || rawStatus === 'WATCH' ? rawStatus : 'NORMAL'
    components.push({
      partId: pid,
      aircraftReg: String(f[1]?.v || aircraftReg),
      ataChapter: String(f[2]?.v || ''),
      nameKo: String(f[3]?.v || ''),
      subsystem: String(f[4]?.v || ''),
      serialNumber: String(f[5]?.v || ''),
      flightHours: Number(f[6]?.v || 0),
      flightCycles: Number(f[7]?.v || 0),
      limitCycles: Number(f[8]?.v || 1),
      wearPct: Number(f[9]?.v || 0),
      tempC: Number(f[10]?.v || 0),
      vibrationIps: Number(f[11]?.v || 0),
      status,
      lastCheckDate: String(f[13]?.v || ''),
      leadTimeHours: Number(f[14]?.v || 0),
      stockIcnHangar: Number(f[15]?.v || 0),
      replacementCostKrw: Number(f[16]?.v || 0),
      maintenanceNote: String(f[17]?.v || ''),
      history: historyMap.get(pid) || [],
    })
  }

  if (components.length === 0) return fallback
  return {
    aircraftReg,
    aircraftModel: 'Boeing 787-10 Dreamliner',
    datasetRef,
    dataSource: 'bigquery_live',
    components,
  }
}

async function fetchGeminiMroInsight(
  gcpProject: string,
  comp: AircraftComponentData,
  cyclesAdded: number,
  hangarHours: number,
  simWearPct: number,
  replaced: boolean
): Promise<MroInsightResponse> {
  const baseline = replaced
    ? `${comp.aircraftReg} ${comp.nameKo} 교체가 완료되어 마모도가 0%로 초기화되었습니다. 차기 정기 점검까지 정상 운항이 가능합니다.`
    : simWearPct >= 90
      ? `${comp.aircraftReg} ${comp.nameKo} 마모도가 ${simWearPct.toFixed(1)}%로 교체 한계에 도달했습니다. 소요 시간(${comp.leadTimeHours}h)과 가용 슬롯(${hangarHours}h), 인천 재고(${comp.stockIcnHangar}기)를 확인해 정비 묶음 편성을 권장합니다.`
      : `${comp.ataChapter} ${comp.nameKo}의 예상 마모도는 ${simWearPct.toFixed(1)}%입니다. ${comp.maintenanceNote}`

  if (!gcpProject) {
    return {
      partId: comp.partId,
      model: GEMINI_MODEL_ID,
      source: 'baseline_brief',
      insight: baseline,
    }
  }

  const token = await getAdcAccessToken()
  if (!token) {
    return {
      partId: comp.partId,
      model: GEMINI_MODEL_ID,
      source: 'baseline_brief',
      insight: baseline,
    }
  }

  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${gcpProject}/locations/global/publishers/google/models/${GEMINI_MODEL_ID}:generateContent`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }
  if (!process.env.K_SERVICE) {
    headers['x-goog-user-project'] = gcpProject
  }

  const prompt = [
    `기체: 대한항공 Boeing 787-10 (${comp.aircraftReg}), 격납고 가용 시간: ${hangarHours}시간`,
    `부품: ${comp.ataChapter} ${comp.nameKo} (${comp.subsystem})`,
    `시뮬레이션 상태: ${replaced ? '신품 교체 완료 (마모도 0%)' : `추가 비행 사이클 +${cyclesAdded} FC, 예상 마모도 ${simWearPct.toFixed(1)}% (한계 ${comp.limitCycles} FC)`}`,
    `센서 및 자재: 온도 ${comp.tempC}°C, 진동 ${comp.vibrationIps} IPS, 인천 격납고 재고 ${comp.stockIcnHangar}기, 교체 소요 ${comp.leadTimeHours}시간`,
    `정비 메모: ${comp.maintenanceNote}`,
  ].join('\n')

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: '당신은 대한항공 정비 계획(MRO Packaging) 엔지니어입니다. 과장된 수식어나 이모지 없이 BigQuery 센서 수치, 격납고 가용 시간 대비 작업 시간, 인천 재고를 근거로 이번 입고 묶음에 포함할지 판단을 한국어 2문장(130자 이내)으로 작성하세요.',
            },
          ],
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          thinkingConfig: { thinkingLevel: 'LOW' },
          temperature: 0.25,
          maxOutputTokens: 2048,
        },
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '')
      console.error(`[gemini-4-hydrogen] HTTP ${resp.status}: ${errTxt.slice(0, 240)}`)
      return {
        partId: comp.partId,
        model: GEMINI_MODEL_ID,
        source: 'baseline_brief',
        insight: baseline,
      }
    }

    const parsed = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
    }
    const text = normalizeText(
      (parsed.candidates?.[0]?.content?.parts || [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text || '')
        .join(' ')
    )
    if (!text) {
      return {
        partId: comp.partId,
        model: GEMINI_MODEL_ID,
        source: 'baseline_brief',
        insight: baseline,
      }
    }
    return {
      partId: comp.partId,
      model: GEMINI_MODEL_ID,
      source: 'live_gemini_api',
      insight: text,
    }
  } catch {
    return {
      partId: comp.partId,
      model: GEMINI_MODEL_ID,
      source: 'baseline_brief',
      insight: baseline,
    }
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
      if (raw.length > 4096) {
        req.destroy()
        resolve(null)
      }
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}') as Record<string, unknown>)
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

export function mroBffPlugin(): Plugin {
  let gcpProject = ''
  let isDev = true

  const registerMiddleware = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(async (req, res, next) => {
      const reqUrl = req.url || '/'
      const isApi = reqUrl.startsWith('/api/')
      applySecurityHeaders(res, isDev, isApi)

      if (!isApi) {
        next()
        return
      }

      const parsedUrl = new URL(reqUrl, 'http://127.0.0.1')
      const pathname = parsedUrl.pathname

      if (pathname === '/api/mro/components' && req.method === 'GET') {
        const regRaw = (parsedUrl.searchParams.get('aircraftReg') || 'HL8515').toUpperCase() as AircraftReg
        const aircraftReg: AircraftReg = VALID_AIRCRAFT_REGS.has(regRaw) ? regRaw : 'HL8515'
        const cached = componentsCache.get(aircraftReg)
        if (cached && cached.expiresAt > Date.now()) {
          sendJson(res, 200, cached.data)
          return
        }
        const data = await fetchComponentsFromBigQuery(gcpProject, aircraftReg)
        componentsCache.set(aircraftReg, { data, expiresAt: Date.now() + BQ_CACHE_TTL_MS })
        sendJson(res, 200, data)
        return
      }

      if (pathname === '/api/mro/insight' && req.method === 'GET') {
        const regRaw = (parsedUrl.searchParams.get('aircraftReg') || 'HL8515').toUpperCase() as AircraftReg
        const aircraftReg: AircraftReg = VALID_AIRCRAFT_REGS.has(regRaw) ? regRaw : 'HL8515'
        const partId = (parsedUrl.searchParams.get('partId') || 'LANDING_GEAR') as PartId
        if (!VALID_PART_IDS.has(partId)) {
          sendJson(res, 400, { error: '유효하지 않은 부품 코드입니다.' })
          return
        }
        const cyclesAdded = Math.min(
          2000,
          Math.max(0, Number.parseInt(parsedUrl.searchParams.get('cyclesAdded') || '0', 10) || 0)
        )
        const hangarHours = Math.min(
          72,
          Math.max(4, Number.parseInt(parsedUrl.searchParams.get('hangarHours') || '16', 10) || 16)
        )
        const replaced = parsedUrl.searchParams.get('replaced') === '1'

        const cachedComp = componentsCache.get(aircraftReg)
        const sourceData =
          cachedComp && cachedComp.expiresAt > Date.now()
            ? cachedComp.data
            : await fetchComponentsFromBigQuery(gcpProject, aircraftReg)
        const comp =
          sourceData.components.find((c) => c.partId === partId) || sourceData.components[0]

        const simWearPct = replaced
          ? 0
          : Math.min(100, ((comp.flightCycles + cyclesAdded) / comp.limitCycles) * 100)

        const cacheKey = `${aircraftReg}::${partId}::${cyclesAdded}::${hangarHours}::${replaced ? '1' : '0'}`
        const cached = insightCache.get(cacheKey)
        if (cached && cached.expiresAt > Date.now() && cached.data.source === 'live_gemini_api') {
          sendJson(res, 200, cached.data)
          return
        }

        const payload = await fetchGeminiMroInsight(
          gcpProject,
          comp,
          cyclesAdded,
          hangarHours,
          simWearPct,
          replaced
        )
        if (payload.source === 'live_gemini_api') {
          insightCache.set(cacheKey, {
            data: payload,
            expiresAt: Date.now() + INSIGHT_CACHE_TTL_MS,
          })
        }
        sendJson(res, 200, payload)
        return
      }

      if (pathname === '/api/mro/replace' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const regRaw = String(body?.aircraftReg || 'HL8515').toUpperCase() as AircraftReg
        const aircraftReg: AircraftReg = VALID_AIRCRAFT_REGS.has(regRaw) ? regRaw : 'HL8515'
        const rawList = Array.isArray(body?.partIds)
          ? body.partIds
          : body?.partId
            ? [body.partId]
            : []
        const partIds = rawList
          .map((p) => String(p))
          .filter((p): p is PartId => VALID_PART_IDS.has(p as PartId))

        if (partIds.length === 0) {
          sendJson(res, 400, { error: '유효한 부품 코드가 필요합니다.' })
          return
        }

        const cyclesAdded = Math.min(
          2000,
          Math.max(0, Number.parseInt(String(body?.cyclesAdded || '0'), 10) || 0)
        )
        const orderId = `WO-${randomUUID().slice(0, 8).toUpperCase()}`
        let loggedToBigQuery = false

        if (gcpProject) {
          const token = await getAdcAccessToken()
          if (token) {
            const actionType = partIds.length > 1 ? 'PACKAGE_REPLACEMENT' : 'PART_REPLACEMENT'
            const results = await Promise.all(
              partIds.map((pid) =>
                runBigQuerySql(
                  gcpProject,
                  token,
                  `INSERT INTO \`${gcpProject}.ke_mro_twin.maintenance_work_orders\`
                   (order_id, part_id, aircraft_reg, action_type, simulated_cycles_added, created_at)
                   VALUES (@orderId, @partId, @aircraftReg, @actionType, @cyclesAdded, CURRENT_TIMESTAMP())`,
                  [
                    { name: 'orderId', parameterType: { type: 'STRING' }, parameterValue: { value: orderId } },
                    { name: 'partId', parameterType: { type: 'STRING' }, parameterValue: { value: pid } },
                    { name: 'aircraftReg', parameterType: { type: 'STRING' }, parameterValue: { value: aircraftReg } },
                    { name: 'actionType', parameterType: { type: 'STRING' }, parameterValue: { value: actionType } },
                    {
                      name: 'cyclesAdded',
                      parameterType: { type: 'INT64' },
                      parameterValue: { value: String(cyclesAdded) },
                    },
                  ]
                )
              )
            )
            loggedToBigQuery = results.every((r) => Boolean(r?.jobComplete))
          }
        }

        const response: MroReplaceResponse = {
          ok: true,
          orderId,
          aircraftReg,
          partIds,
          loggedToBigQuery,
        }
        sendJson(res, 200, response)
        return
      }

      sendJson(res, 404, { error: '존재하지 않는 API 경로입니다.' })
    })
  }

  return {
    name: 'ke-mro-bff-plugin',
    async configResolved(config) {
      isDev = config.command === 'serve'
      const env = loadEnv(config.mode, process.cwd(), '')
      gcpProject = await resolveGcpProjectId(
        (
          process.env.GOOGLE_CLOUD_PROJECT ||
          process.env.GCLOUD_PROJECT ||
          env.GOOGLE_CLOUD_PROJECT ||
          env.GCLOUD_PROJECT ||
          ''
        ).trim()
      )
    },
    configureServer(server) {
      registerMiddleware(server)
    },
    configurePreviewServer(server) {
      registerMiddleware(server)
    },
  }
}
