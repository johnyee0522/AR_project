# Cuebit

당구대 위의 공 위치와 큐 방향을 인식한 뒤, 예상 경로를 AR 형태로 보여주는 React/Vite 프로젝트입니다.

현재 앱은 개발 모드에서 테스트 패널 값을 사용하고, production 카메라 경로에서는 YOLO/ONNXRuntime 결과를 연결할 수 있는 지점을 열어둔 상태입니다.

## 실행

```bash
npm install
npm run dev
```

검증 명령어:

```bash
npm run build
npm run lint
npm run test:physics
```

## 좌표계

프로젝트 내부 좌표는 모두 meter 단위입니다.

- 원점: 당구대 왼쪽 위
- x: 오른쪽으로 증가
- y: 아래쪽으로 증가
- 테이블 크기: `2.84m x 1.42m`
- 중앙 좌표: `{ x: 1.42, y: 0.71 }`
- 각도: `0deg = 오른쪽`, `90deg = 아래쪽`, `180deg = 왼쪽`, `270deg = 위쪽`

YOLO 팀은 이미지 픽셀 좌표나 0~1000 정규화 좌표가 아니라, homography 보정이 끝난 meter 좌표를 넘겨야 합니다.

각도는 meter 좌표계 기준으로 계산합니다.

```ts
const dx = target.x - cue.x;
const dy = target.y - cue.y;
const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
const normalizedAngleDeg = (angleDeg + 360) % 360;
```

## YOLO 연동 입력

공용 감지 타입은 `src/types/detection.ts`에 있습니다. 외부 통합 입력은 아래 `DetectedState` 구조를 사용합니다.

```ts
export interface DetectedState {
  cue: {
    angleDeg: number; // 0=right, 90=down, 180=left, 270=up
    power: number; // internal range: 0 ~ 3
    hitPoint: {
      x: number; // -1=left, 0=center, 1=right
      y: number; // -1=draw/bottom, 0=center, 1=follow/top
    };
  };
  shot: {
    cueBallId: string;
  };
  balls: {
    id: string;
    x: number; // meter
    y: number; // meter
  }[];
}
```

예시:

```ts
const detectedState: DetectedState = {
  cue: {
    angleDeg: 35,
    power: 0.7,
    hitPoint: {
      x: 0,
      y: 0,
    },
  },
  shot: {
    cueBallId: "white",
  },
  balls: [
    { id: "white", x: 0.57, y: 1.07 },
    { id: "red", x: 1.42, y: 0.71 },
    { id: "yellow", x: 1.99, y: 0.43 },
  ],
};
```

연결 위치는 `src/hooks/use_camera.ts`의 production frame callback입니다. 현재는 카메라 프레임을 캔버스에 그린 뒤 `onFrame(null)`을 호출합니다. YOLO/ONNXRuntime 결과가 준비되면 `null` 대신 meter 좌표의 `DetectedState`를 넘기면 됩니다.

## 물리엔진 입력 변환

물리엔진 내부는 수구 id를 `"cue"`로 사용합니다. 그래서 외부에서 `"white"` 같은 id를 넘겨도, `detectedStateToPredictShotInput()` 어댑터가 `shot.cueBallId`에 해당하는 공을 내부 `"cue"`로 변환합니다.

```ts
import { detectedStateToPredictShotInput } from "@/lib/physics";

const physicsInput = detectedStateToPredictShotInput(detectedState);
```

어댑터 변환 규칙:

- `cue.angleDeg` -> `angle`
- `cue.power` -> `power`
- `cue.hitPoint.x * 100` -> `sideSpin`
- `cue.hitPoint.y * 100` -> `topSpin`
- `shot.cueBallId`에 해당하는 공 id -> 내부 `"cue"`

## 물리엔진 직접 사용

간단한 호출은 `predictShot()`을 사용합니다.

```ts
import { predictFinalPositions, predictShot } from "@/lib/physics";

const result = predictShot({
  balls: {
    cue: { x: 0.57, y: 1.07 },
    red: { x: 1.42, y: 0.71 },
    yellow: { x: 1.99, y: 0.43 },
  },
  angle: 45,
  power: 1.2,
  sideSpin: 0,
  topSpin: 0,
});

const finalPositions = predictFinalPositions({
  balls: {
    cue: { x: 0.57, y: 1.07 },
    red: { x: 1.42, y: 0.71 },
    yellow: { x: 1.99, y: 0.43 },
  },
  angle: 45,
  power: 1.2,
});
```

반복 호출이 많은 화면에서는 `Simulation2D` 인스턴스를 유지하고, 공 위치 갱신 후 `predict()`를 호출합니다.

```ts
const sim = new Simulation2D();
sim.updateBallPositionsMeters(balls);
const result = sim.predict(angle, power, 2400, sideSpin, topSpin);
```

반환값에는 다음 정보가 들어갑니다.

- `trajectories`: AR 점선 렌더링용 공별 경로
- `events`: 공-공 충돌, 쿠션 충돌 이벤트
- `summary.travelDistanceByBall`: 공별 실제 이동거리
- `summary.trajectoryDistanceByBall`: 화면에 그려지는 waypoint 기준 거리
- `summary.finalPositions`: 공별 최종 위치

## 주요 파일

- `src/app/routes/main/index.tsx`: 카메라 입력, 물리엔진, AR 렌더링 연결
- `src/app/routes/main/test_panel.tsx`: 개발용 수동 입력 패널
- `src/hooks/use_camera.ts`: 카메라 프레임과 YOLO 결과 연결 지점
- `src/hooks/use_ar.ts`: 물리 결과를 AR/minimap 캔버스에 그림
- `src/hooks/use_simulation.ts`: `Simulation2D` 인스턴스 유지
- `src/types/detection.ts`: YOLO/ONNXRuntime 통합 입력 타입
- `src/lib/physics/detection_adapter.ts`: 외부 `DetectedState`를 물리엔진 입력으로 변환
- `src/lib/physics/simulation_2d.ts`: 2D 당구 물리엔진
- `src/lib/physics/physics_constants.ts`: 테이블 크기, 공 반지름, 중력 상수
- `src/lib/physics/power_calibration.ts`: 파워별 이동거리 보정 도구
- `docs/physics_status.md`: 현실 당구 물리현상 대비 구현 현황 표
- `scripts/physics_regression_test.ts`: 물리엔진 기본 규칙 회귀 테스트

## 현재 남은 통합 작업

- YOLO/ONNXRuntime 결과를 `DetectedState`로 변환해서 `use_camera.ts`에 연결
- 실측 데이터 기반으로 `Simulation2D` 튜닝값 보정
- 실제 기기에서 AR 캔버스 위치와 카메라 프레임 정렬 확인
