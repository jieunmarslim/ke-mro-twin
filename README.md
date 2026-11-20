# KOREAN AIR MRO — B787-10 3D 정비 부품 시뮬레이터 (`ke-mro-twin`)

Three.js 3D Boeing 787-10(`HL8515`) 기체 모델의 8개 주요 부품을 직접 클릭해 **BigQuery(`ke_mro_twin`)** 정비 센서 데이터, 비행 사이클 누적 마모, 3D 분해 뷰(Exploded View), 부품 교체 작업지시 기록 및 `gemini-4-hydrogen` 정비 인사이트를 시뮬레이션하는 웹 앱입니다.

## 주요 기능

- **3D 인터랙티브 항공기 모델 (`AircraftMroStage`)**: 기수 레이돔, 동체 여압(ECS), 좌·우 주익, 좌·우 GEnx-1B 터보팬 엔진(회전 팬 블레이드 포함), 메인 랜딩기어, 꼬리날개·APU를 Raycaster로 직접 클릭해 카메라 포커스 및 상태 색상을 확인하고 `분해 뷰 / 조립 뷰`를 전환합니다.
- **BigQuery 연동 (`mroBffPlugin.ts`)**: API 키 없이 Google Cloud ADC/IAM으로 `ke_mro_twin.aircraft_components`와 `ke_mro_twin.sensor_history`를 조회하며, 부품 교체 실행 시 `ke_mro_twin.maintenance_work_orders`에 작업지시 이력을 파라미터화 쿼리로 기록합니다.
- **비행 사이클 마모 시뮬레이션 & `gemini-4-hydrogen` 정비 인사이트**: `+250 / +500 / +1,000 FC` 누적 시뮬레이션에 따라 부품별 마모도와 상태(`정상 · 주의 · 교체 필요`)가 3D 기체에 반영되고, 선택 부품의 정비 의사결정 요약을 `gemini-4-hydrogen`으로 생성합니다.

## 실행 방법

```bash
npm install
npm run dev
```

로컬 서버는 `http://127.0.0.1:5174`에서 실행됩니다.
