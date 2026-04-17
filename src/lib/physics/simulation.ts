import type RAPIER from "@dimforge/rapier2d";
import type { PhysicsResult, Point } from "@/types/physics";

/**
 * Rapier2D를 이용한 물리 시뮬레이션 및 궤적 예측 클래스
 */
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

	/**
	 * 물리 월드 리소스 해제
	 */
	public destroy() {
		this.world.free();
	}

	/**
	 * 당구대 벽면(충돌체) 설정
	 */
	private setupTable() {
		const W = this.TABLE_WIDTH_M;
		const H = this.TABLE_HEIGHT_M;
		const thickness = 0.1;

		this.createWall(W / 2, -thickness, W / 2 + thickness, thickness);
		this.createWall(W / 2, H + thickness, W / 2 + thickness, thickness);
		this.createWall(-thickness, H / 2, thickness, H / 2 + thickness);
		this.createWall(W + thickness, H / 2, thickness, H / 2 + thickness);
	}

	private createWall(x: number, y: number, hx: number, hy: number) {
		const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, y);
		const body = this.world.createRigidBody(bodyDesc);
		const colliderDesc = this.rapier.ColliderDesc.cuboid(hx, hy)
			.setRestitution(0.85)
			.setFriction(0.2);
		this.world.createCollider(colliderDesc, body);
	}

	/**
	 * 공의 위치를 감지된 데이터나 테스트 데이터로 동기화
	 * @param ballPositions 공 ID별 정규화된 좌표 (0-1000)
	 */
	public updateBallPositions(ballPositions: Record<string, Point>) {
		for (const [id, pos] of Object.entries(ballPositions)) {
			const mX = (pos.x / 1000) * this.TABLE_WIDTH_M;
			const mY = (pos.y / 1000) * this.TABLE_HEIGHT_M;

			let body = this.balls.get(id);
			if (!body) {
				const bodyDesc = this.rapier.RigidBodyDesc.dynamic().setTranslation(
					mX,
					mY,
				);
				body = this.world.createRigidBody(bodyDesc);
				const colliderDesc = this.rapier.ColliderDesc.ball(this.BALL_RADIUS_M)
					.setRestitution(0.92)
					.setFriction(0.1)
					.setDensity(1.0);
				this.world.createCollider(colliderDesc, body);
				body.setLinearDamping(0.15);
				body.setAngularDamping(0.15);
				this.balls.set(id, body);
			} else {
				body.setTranslation({ x: mX, y: mY }, true);
				body.setLinvel({ x: 0, y: 0 }, true);
				body.setAngvel(0, true);
			}
		}
	}

	/**
	 * 현재 위치와 타격 파라미터를 기반으로 궤적 예측
	 * @param angleDeg 타격 각도 (도)
	 * @param power 타격 세기
	 * @param maxSteps 최대 시뮬레이션 스텝
	 */
	public predict(
		angleDeg: number,
		power: number,
		maxSteps: number = 300,
	): PhysicsResult {
		const cueBall = this.balls.get("cue");
		if (!cueBall) return { trajectories: [] };

		const allBalls = Array.from(this.balls.values());
		const ballIds = Array.from(this.balls.keys());

		const backupStates = allBalls.map((ball) => ({
			translation: ball.translation(),
			rotation: ball.rotation(),
			linvel: ball.linvel(),
			angvel: ball.angvel(),
		}));

		const angleRad = (angleDeg * Math.PI) / 180;
		cueBall.setLinvel(
			{ x: Math.cos(angleRad) * power, y: Math.sin(angleRad) * power },
			true,
		);

		const ballTracks = ballIds.map((id) => ({
			ballId: id,
			waypoints: [] as Point[],
			isStopped: false,
		}));

		for (let i = 0; i < maxSteps; i++) {
			this.world.step();
			let anyMoving = false;

			allBalls.forEach((ball, index) => {
				const track = ballTracks[index];
				if (track.isStopped) return;

				const pos = ball.translation();
				const vel = ball.linvel();
				const speedSq = vel.x * vel.x + vel.y * vel.y;

				track.waypoints.push(this.toNormalized(pos.x, pos.y));
				if (speedSq < 0.001) track.isStopped = true;
				else anyMoving = true;
			});

			if (!anyMoving) break;
		}

		// 예측 후 원래 상태로 복구
		allBalls.forEach((ball, index) => {
			const state = backupStates[index];
			ball.setTranslation(state.translation, true);
			ball.setRotation(state.rotation, true);
			ball.setLinvel(state.linvel, true);
			ball.setAngvel(state.angvel, true);
		});

		return {
			trajectories: ballTracks.map((t) => ({
				ballId: t.ballId,
				waypoints: t.waypoints,
			})),
		};
	}

	/**
	 * 미터 단위를 정규화 좌표계(0-1000)로 변환
	 */
	private toNormalized(metersX: number, metersY: number): Point {
		return {
			x: (metersX / this.TABLE_WIDTH_M) * 1000,
			y: (metersY / this.TABLE_HEIGHT_M) * 1000,
		};
	}
}
