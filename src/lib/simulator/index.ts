// src/lib/simulator.ts
import type { PhysicsResult, Point } from "@/types/physics";

const BALL_RADIUS = 15;
const TABLE_SIZE = 1000;

export function simulateTrajectory(
	cue: Point,
	angleDeg: number,
	objects: Point[],
): PhysicsResult {
	const waypoints: Point[] = [cue];
	let current = { ...cue };
	let angleRad = (angleDeg * Math.PI) / 180;

	for (let bounce = 0; bounce < 5; bounce++) {
		const dx = Math.cos(angleRad);
		const dy = Math.sin(angleRad);

		let tMin = Infinity;
		let hitType: "wall_x" | "wall_y" | "ball" | null = null;
		let hitBallIdx = -1;

		// 1. 벽 충돌 확인
		if (dx > 0) {
			const t = (TABLE_SIZE - current.x) / dx;
			if (t < tMin) {
				tMin = t;
				hitType = "wall_x";
			}
		}
		if (dx < 0) {
			const t = (0 - current.x) / dx;
			if (t < tMin) {
				tMin = t;
				hitType = "wall_x";
			}
		}
		if (dy > 0) {
			const t = (TABLE_SIZE - current.y) / dy;
			if (t < tMin) {
				tMin = t;
				hitType = "wall_y";
			}
		}
		if (dy < 0) {
			const t = (0 - current.y) / dy;
			if (t < tMin) {
				tMin = t;
				hitType = "wall_y";
			}
		}

		// 2. 모든 적구와 충돌 확인 (배열 순회)
		objects.forEach((obj, idx) => {
			const L = { x: obj.x - current.x, y: obj.y - current.y };
			const tca = L.x * dx + L.y * dy;
			if (tca < 0) return;
			const d2 = L.x * L.x + L.y * L.y - tca * tca;
			const r2 = (BALL_RADIUS * 2) ** 2;
			if (d2 > r2) return;
			const thc = Math.sqrt(r2 - d2);
			const t0 = tca - thc;
			if (t0 > 0.01 && t0 < tMin) {
				tMin = t0;
				hitType = "ball";
				hitBallIdx = idx;
			}
		});

		if (tMin === Infinity) break;

		// 위치 업데이트
		current = { x: current.x + dx * tMin, y: current.y + dy * tMin };
		waypoints.push({ ...current });

		// 반사각 계산
		if (hitType === "wall_x") angleRad = Math.PI - angleRad;
		else if (hitType === "wall_y") angleRad = -angleRad;
		else if (hitType === "ball") {
			const hitBall = objects[hitBallIdx];
			const nx = (current.x - hitBall.x) / (BALL_RADIUS * 2);
			const ny = (current.y - hitBall.y) / (BALL_RADIUS * 2);
			const dot = dx * nx + dy * ny;
			angleRad = Math.atan2(dy - 2 * dot * ny, dx - 2 * dot * nx);
		}
	}

	// 화면에 적구(빨간공, 노란공)들도 렌더링되게 가만히 있는 점을 찍어 반환합니다.
	const trajectories = [{ ballId: "cue", waypoints }];
	objects.forEach((obj, idx) => {
		trajectories.push({
			ballId: idx === 0 ? "red" : "yellow", // 첫 번째 적구는 빨강, 두 번째는 노랑
			waypoints: [obj, { x: obj.x + 0.1, y: obj.y + 0.1 }], // 정지 상태
		});
	});

	return { trajectories };
}
