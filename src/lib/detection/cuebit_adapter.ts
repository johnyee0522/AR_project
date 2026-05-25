import cv from "@techstark/opencv-js";

import { restoreMat, withMatScope } from "@/common";
import type Cuebit from "@/lib/cuebit";
import { TABLE_HEIGHT_M, TABLE_WIDTH_M } from "@/lib/physics/physics_constants";
import type { DetectedBall, DetectedState } from "@/types/detection";

type CuebitResult = Awaited<ReturnType<Cuebit["process"]>>;
type CueLine = NonNullable<NonNullable<CuebitResult["cue"]>["line"]>;

export interface CuebitAdapterOptions {
  power?: number;
  hitPoint?: { x: number; y: number };
  cueBallId?: string;
}

const DEFAULT_BALL_IDS = ["cueBall", "red", "yellow"] as const;
const FALLBACK_CUE_BALL_ID = "cueBall";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getBallId(index: number) {
  // TODO: 비전에서 공 색상/역할을 안정적으로 알 수 있게 되면 이 매핑만 교체한다.
  return DEFAULT_BALL_IDS[index] ?? `ball${index + 1}`;
}

function angleFromCueLine(line: CueLine | null | undefined) {
  if (!line) {
    return null;
  }

  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;

  if (Math.hypot(dx, dy) < 1e-6) {
    return null;
  }

  return ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
}

function transformBallsToMeters(result: CuebitResult): DetectedBall[] {
  const table = result.table;

  if (!table || result.balls.length === 0) {
    return [];
  }

  return withMatScope((track) => {
    const srcPoints = result.balls.flatMap((ball) => [ball.x, ball.y]);
    const src = track(
      cv.matFromArray(result.balls.length, 1, cv.CV_32FC2, srcPoints),
    );
    const dst = track(new cv.Mat());
    const transform = track(restoreMat(table.matrix.transform));

    cv.perspectiveTransform(src, dst, transform);

    return result.balls.map((_, index) => {
      const xMm = dst.data32F[index * 2] ?? 0;
      const yMm = dst.data32F[index * 2 + 1] ?? 0;

      return {
        id: getBallId(index),
        x: clamp(xMm * 0.001, 0, TABLE_WIDTH_M),
        y: clamp(yMm * 0.001, 0, TABLE_HEIGHT_M),
      };
    });
  });
}

export function cuebitResultToDetectedState(
  result: CuebitResult,
  options: CuebitAdapterOptions = {},
): DetectedState | null {
  const balls = transformBallsToMeters(result);

  if (balls.length === 0) {
    return null;
  }

  const cueBallId = options.cueBallId ?? FALLBACK_CUE_BALL_ID;
  const hasCueBall = balls.some((ball) => ball.id === cueBallId);

  if (!hasCueBall) {
    return null;
  }

  // TODO: 비전에서 타격 세기/당점 추정이 들어오면 options fallback 대신 result 값을 사용한다.
  return {
    cue: {
      angleDeg: angleFromCueLine(result.cue?.line) ?? 0,
      power: options.power ?? 1,
      hitPoint: options.hitPoint ?? { x: 0, y: 0 },
    },
    shot: {
      cueBallId,
    },
    balls,
  };
}
