import type RAPIER from "@dimforge/rapier2d";
import type { PhysicsResult, Point } from "@/types/physics";

export class Simulation {
	private world: RAPIER.World;
	private rapier: typeof RAPIER;
	private balls: Map<string, RAPIER.RigidBody> = new Map();

	private readonly TABLE_WIDTH_M = 2.84;
	private readonly TABLE_HEIGHT_M = 1.42;
	private readonly BALL_RADIUS_M = 0.03075;

	constructor(rapier: typeof RAPIER) {
		this.rapier = rapier;
		this.world = new this.rapier.World({ x: 0.0, y: 0.0 });
		this.setupTable();
	}

	public destroy() {
		this.world.free();
	}

	private setupTable() {
		const W = this.TABLE_WIDTH_M;
		const H = this.TABLE_HEIGHT_M;
		const thickness = 0.1;

		// 상단 벽
		this.createWall(W / 2, -thickness, W / 2 + thickness, thickness);
		// 하단 벽
		this.createWall(W / 2, H + thickness, W / 2 + thickness, thickness);
		// 좌측 벽
		this.createWall(-thickness, H / 2, thickness, H / 2 + thickness);
		// 우측 벽
		this.createWall(W + thickness, H / 2, thickness, H / 2 + thickness);
	}

	private createWall(x: number, y: number, hx: number, hy: number) {
		const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, y);
		const body = this.world.createRigidBody(bodyDesc);
		const colliderDesc = this.rapier.ColliderDesc.cuboid(hx, hy)
			.setRestitution(0.85)
			.setFriction(0.05); // 수정: 0.6 → 0.05 (쿠션 마찰 낮춤)
		this.world.createCollider(colliderDesc, body);
	}

	public updateBallPositions(ballPositions: Record<string, Point>) {
		for (const [id, pos] of Object.entries(ballPositions)) {
			if (isNaN(pos.x) || isNaN(pos.y)) continue;

			const mX = (pos.x / 1000) * this.TABLE_WIDTH_M;
			const mY = (pos.y / 1000) * this.TABLE_HEIGHT_M;

			// 테이블 범위 내로 클램핑 (벽과 겹침 방지)
			const margin = this.BALL_RADIUS_M + 0.005;
			const safeX = Math.max(margin, Math.min(this.TABLE_WIDTH_M - margin, mX));
			const safeY = Math.max(margin, Math.min(this.TABLE_HEIGHT_M - margin, mY));

			let body = this.balls.get(id);
			if (!body) {
				const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
					.setTranslation(safeX, safeY)
					.setLinearDamping(0.2)  // 수정: 0.8 → 0.2
					.setAngularDamping(0.2); // 수정: 0.8 → 0.2

				body = this.world.createRigidBody(bodyDesc);
				const colliderDesc = this.rapier.ColliderDesc.ball(this.BALL_RADIUS_M)
					.setRestitution(0.92)
					.setFriction(0.1)
					.setDensity(70.7);

				this.world.createCollider(colliderDesc, body);
				this.balls.set(id, body);
			} else {
				body.setTranslation({ x: safeX, y: safeY }, true);
				body.setLinvel({ x: 0, y: 0 }, true);
				body.setAngvel(0, true);
			}
		}

		// 공 위치 설정 후 1스텝 실행해서 충돌 해결
		// → 이후 predict에서 첫 스텝이 튀지 않음
		this.world.step();

		// 스텝 후 다시 속도 0으로 초기화 (위치만 정착)
		for (const body of this.balls.values()) {
			body.setLinvel({ x: 0, y: 0 }, true);
			body.setAngvel(0, true);
		}
	}

	public predict(
		angleDeg: number,
		power: number,
		maxSteps = 300,
		offsetSide = 0,
		offsetTop = 0,
	): PhysicsResult {
		const cueBall = this.balls.get("cue");
		if (!cueBall) return { trajectories: [] };

		const allBalls = Array.from(this.balls.values());
		const ballIds = Array.from(this.balls.keys());

		// 현재 상태 백업
		const backupStates = allBalls.map((ball) => ({
			translation: { ...ball.translation() },
			rotation: ball.rotation(),
			linvel: { ...ball.linvel() },
			angvel: ball.angvel(),
		}));

		// 초기 속도 설정
		const angleRad = (angleDeg * Math.PI) / 180;
		const v0 = power * 3.0;
		const vx = Math.cos(angleRad) * v0;
		const vy = Math.sin(angleRad) * v0;

		cueBall.setLinvel({ x: vx, y: vy }, true);

		// 사이드 스핀: 수직 방향으로 약한 초기 속도 추가
		// (실제로는 마찰로 구현해야 하나 2D 한계로 근사치)
		if (Math.abs(offsetSide) > 0.5) {
			const perpX = -Math.sin(angleRad);
			const perpY = Math.cos(angleRad);
			const sideV = (offsetSide / 30) * v0 * 0.08;
			cueBall.setLinvel({
				x: vx + perpX * sideV,
				y: vy + perpY * sideV,
			}, true);
		}

		// 상하 스핀: 팔로우(+)는 마찰 감쇠 감소, 드로우(-)는 마찰 감쇠 증가로 근사
		// 실제로는 공이 쿠션/타겟 충돌 후 속도에 영향을 줌
		const spinDamping = 0.2 - (offsetTop / 30) * 0.12;
		// spinDamping 범위: 드로우(-30) → 0.32, 팔로우(+30) → 0.08
		cueBall.setLinearDamping(Math.max(0.05, Math.min(0.4, spinDamping)));

		// 궤적 기록 초기화
		const ballTracks = ballIds.map((id, index) => {
			const pos = allBalls[index].translation();
			return {
				ballId: id,
				waypoints: [this.toNormalized(pos.x, pos.y)],
				isStopped: false,
				lastPos: { x: pos.x, y: pos.y },
			};
		});

		// 시뮬레이션 루프
		const MIN_RECORD_DIST_M = 0.01; // 1cm 이상 이동했을 때만 기록 (노이즈 제거)

		for (let i = 0; i < maxSteps; i++) {
			this.world.step();
			let anyMoving = false;

			for (let j = 0; j < allBalls.length; j++) {
				const ball = allBalls[j];
				const track = ballTracks[j];
				if (track.isStopped) continue;

				const pos = ball.translation();
				const vel = ball.linvel();
				const speedSq = vel.x * vel.x + vel.y * vel.y;

				if (isNaN(pos.x) || isNaN(pos.y)) {
					track.isStopped = true;
					continue;
				}

				// 이전 위치와 충분히 멀어졌을 때만 기록 (튀는 점 방지)
				const dx = pos.x - track.lastPos.x;
				const dy = pos.y - track.lastPos.y;
				const distSq = dx * dx + dy * dy;

				if (distSq >= MIN_RECORD_DIST_M * MIN_RECORD_DIST_M) {
					track.waypoints.push(this.toNormalized(pos.x, pos.y));
					track.lastPos = { x: pos.x, y: pos.y };
				}

				if (speedSq < 0.005) {
					// 멈춤 — 마지막 위치 기록
					track.waypoints.push(this.toNormalized(pos.x, pos.y));
					track.isStopped = true;
				} else {
					anyMoving = true;
				}
			}

			if (!anyMoving) break;
		}

		// 상태 복구
		for (let i = 0; i < allBalls.length; i++) {
			const ball = allBalls[i];
			const state = backupStates[i];
			ball.setTranslation(state.translation, true);
			ball.setRotation(state.rotation, true);
			ball.setLinvel(state.linvel, true);
			ball.setAngvel(state.angvel, true);
		}

		// cue ball damping 복구
		cueBall.setLinearDamping(0.2);

		return {
			trajectories: ballTracks.map((t) => ({
				ballId: t.ballId,
				waypoints: t.waypoints,
			})),
		};
	}

	private toNormalized(metersX: number, metersY: number): Point {
		return {
			x: (metersX / this.TABLE_WIDTH_M) * 1000,
			y: (metersY / this.TABLE_HEIGHT_M) * 1000,
		};
	}
}