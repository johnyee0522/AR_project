import type { PhysicsResult, Point } from "@/types/physics";

// 당구대 크기 (0~1000 좌표계)
const TABLE_MIN = 0;
const TABLE_MAX = 1000;

// 최대 쿠션 반사 횟수
const MAX_BOUNCES = 5;

/**
 * 임시 당구 궤적 시뮬레이터
 * 진짜 물리엔진 연동 전까지 사용하는 모듈.
 *
 * 입사각 = 반사각 원리로 공이 벽에 부딪힐 때마다
 * 꺾이는 지점(waypoint)을 계산해서 반환합니다.
 *
 * @param startPos 수구 현재 위치 (0~1000 좌표)
 * @param angleDeg 타격 각도 (0~360도, 오른쪽이 0도)
 * @returns PhysicsResult — waypoints 배열
 */
export function simulateTrajectory(
	startPos: Point,
	angleDeg: number,
): PhysicsResult {
	const waypoints: Point[] = [startPos];

	// 각도를 라디안으로 변환
	let angleRad = (angleDeg * Math.PI) / 180;

	let current = { ...startPos };

	for (let i = 0; i < MAX_BOUNCES; i++) {
		// 현재 방향 벡터
		const dx = Math.cos(angleRad);
		const dy = Math.sin(angleRad);

		// 각 벽까지의 거리 계산
		const times: { t: number; axis: "x" | "y" }[] = [];

		if (dx > 0) times.push({ t: (TABLE_MAX - current.x) / dx, axis: "x" });
		if (dx < 0) times.push({ t: (TABLE_MIN - current.x) / dx, axis: "x" });
		if (dy > 0) times.push({ t: (TABLE_MAX - current.y) / dy, axis: "y" });
		if (dy < 0) times.push({ t: (TABLE_MIN - current.y) / dy, axis: "y" });

		// 가장 먼저 부딪히는 벽 찾기
		const hit = times
			.filter((t) => t.t > 0.01)
			.sort((a, b) => a.t - b.t)[0];

		if (!hit) break;

		// 충돌 지점 계산
		const hitPoint: Point = {
			x: Math.round(current.x + dx * hit.t),
			y: Math.round(current.y + dy * hit.t),
		};

		// 벽 범위 내로 클램핑
		hitPoint.x = Math.max(TABLE_MIN, Math.min(TABLE_MAX, hitPoint.x));
		hitPoint.y = Math.max(TABLE_MIN, Math.min(TABLE_MAX, hitPoint.y));

		waypoints.push(hitPoint);
		current = hitPoint;

		// 반사각 계산 (입사각 = 반사각)
		if (hit.axis === "x") {
			angleRad = Math.PI - angleRad; // 좌우 벽 반사
		} else {
			angleRad = -angleRad; // 상하 벽 반사
		}
	}

	return {
		trajectories: [
			{
				ballId: "cue",
				waypoints,
			},
		],
	};
}