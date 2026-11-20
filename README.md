# KOREAN AIR MRO — B787-10 3D 정비 패키징 시뮬레이터 (`ke-mro-twin`)

Three.js 3D Boeing 787-10 기단(`HL8515 · HL8516 · HL8517`) 모델에서 **BigQuery(`ke_mro_twin`)** 누적 정비 이력을 불러와 격납고 가용 시간 안에 어떤 부품을 묶어 교체할지 시뮬레이션하고, `gemini-4-hydrogen` 판단 요약이 담긴 **정비 작업지시서(Work Order) 문서**를 발행하는 웹 앱입니다.

## 주요 기능

- **3D 인터랙티브 기체 모델 (`AircraftMroStage`)**: 기수 레이돔, 동체 여압(ECS), 좌·우 주익, 좌·우 GEnx-1B 터보팬 엔진(회전 팬 블레이드 포함), 메인 랜딩기어, 꼬리날개·APU를 Raycaster로 클릭해 상태와 마모도를 확인하고 `분해 뷰` · `X-Ray` 모드를 전환합니다.
- **정비 패키징 & 격납고 슬롯 시뮬레이터 (`PartAssemblyTree`, `TopMroHud`)**: 3대 기체(`HL8515 / HL8516 / HL8517`), 격납고 슬롯(`8h 단기 / 16h 야간 / 36h C-Check`), 추가 운항 시뮬레이션(`현재 / +250 FC / +500 FC`)에 따라 소요 시간 초과 여부와 인천 격납고 잔여 재고를 계산하고 `자동 묶음`을 제안합니다.
- **정비 작업지시서 문서 발행 (`WorkOrderDocModal`)**: 묶음 정비 또는 단독 정비 실행 시 공식 정비 작업지시서(문서번호, 대상 기체, `gemini-4-hydrogen` 정비 판단 요약, ATA/시리얼/마모도/재고/비용 표, 담당 정비사·QA 서명란)를 띄우고 **인쇄/PDF 저장** 및 **마크다운(`.md`) 다운로드**를 제공합니다. BigQuery에는 발행 이력만 기록합니다.
- **BigQuery & `gemini-4-hydrogen` BFF (`mroBffPlugin.ts`)**: API 키 없이 Google Cloud ADC/IAM으로 `ke_mro_twin.aircraft_components`와 `ke_mro_twin.sensor_history`를 파라미터화 쿼리로 조회하고 `gemini-4-hydrogen`으로 정비 판단 요약을 생성합니다.

## 실행 방법

```bash
npm install
npm run dev
```

로컬 서버는 `http://127.0.0.1:5174`에서 실행됩니다.
