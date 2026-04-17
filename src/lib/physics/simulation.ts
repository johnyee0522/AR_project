import type RAPIER from "@dimforge/rapier2d";
import type { PhysicsResult, Point } from "@/types/physics";

// 물리 연산을 위한 공의 상태 인터페이스
interface BallState {
	body: RAPIER.RigidBody;
	forwardSpin: number; // 진행 방향 기준 상하 회전 속도 (rad/s)
	heading: { x: number; y: number }; // 공의 현재 진행 방향 벡터
}

export class Simulation {
	private world: RAPIER.World;
	private rapier: typeof RAPIER;
	private balls: Map<string, BallState> = new Map();

	// 당구대 및 공 물리 상수 (MKS 단위계)
	private readonly TABLE_WIDTH_M = 2.84;
	private readonly TABLE_HEIGHT_M = 1.42;
	private readonly BALL_RADIUS_M = 0.03075;
	private readonly MASS = 0.21; // 당구공 질량 (kg)
	private readonly GRAVITY = 9.8; // 중력 가속도 (m/s^2)
	private readonly MU_K = 0.2; // 천(라사지)의 동마찰 계수
	private readonly I = (2 / 5) * 0.21 * Math.pow(0.03075, 2); // 구의 관성 모멘트

	constructor(rapier: typeof RAPIER) {
		this.rapier = rapier;
		this.world = new this.rapier.World({ x: 0.0, y: 0.0 });
		this.setupTable();
	}

	public destroy() {
		this.world.free();
	}

	// 당구대 벽면 생성
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
			.setFriction(0.05);
		this.world.createCollider(colliderDesc, body);
	}

	// 외부에서 감지된 공 위치를 물리 엔진에 동기화
	public updateBallPositions(ballPositions: Record<string, Point>) {
		for (const [id, pos] of Object.entries(ballPositions)) {
			if (isNaN(pos.x) || isNaN(pos.y)) continue;

			const mX = (pos.x / 1000) * this.TABLE_WIDTH_M;
			const mY = (pos.y / 1000) * this.TABLE_HEIGHT_M;

			const margin = this.BALL_RADIUS_M + 0.005;
			const safeX = Math.max(margin, Math.min(this.TABLE_WIDTH_M - margin, mX));
			const safeY = Math.max(margin, Math.min(this.TABLE_HEIGHT_M - margin, mY));

			let state = this.balls.get(id);
			if (!state) {
				const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
					.setTranslation(safeX, safeY)
					.setLinearDamping(0.2)
					.setAngularDamping(0.2);

				const body = this.world.createRigidBody(bodyDesc);
				const colliderDesc = this.rapier.ColliderDesc.ball(this.BALL_RADIUS_M)
					.setRestitution(0.92)
					.setFriction(0.1)
					.setDensity(this.MASS);

				this.world.createCollider(colliderDesc, body);
				this.balls.set(id, { body, forwardSpin: 0, heading: { x: 0, y: 0 } });
			} else {
				state.body.setTranslation({ x: safeX, y: safeY }, true);
				state.body.setLinvel({ x: 0, y: 0 }, true);
				state.body.setAngvel(0, true);
				state.forwardSpin = 0;
			}
		}

		this.world.step();

		for (const state of this.balls.values()) {
			state.body.setLinvel({ x: 0, y: 0 }, true);
			state.body.setAngvel(0, true);
		}
	}

	// 궤적 예측 시뮬레이션 실행
	public predict(
		angleDeg: number,
		power: number,
		offsetTop = 0,
		offsetSide = 0,
		maxSteps = 300,
	): PhysicsResult {
		const cueState = this.balls.get("cue");
		if (!cueState) return { trajectories: [] };

		const allStates = Array.from(this.balls.values());
		const ballIds = Array.from(this.balls.keys());

		// 현재 상태 백업
		const backupStates = allStates.map((state) => ({
			translation: { ...state.body.translation() },
			rotation: state.body.rotation(),
			linvel: { ...state.body.linvel() },
			angvel: state.body.angvel(),
			forwardSpin: state.forwardSpin,
			heading: { ...state.heading },
		}));

		// 초기 물리량 설정
		const angleRad = (angleDeg * Math.PI) / 180;
		const dir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
		cueState.heading = { ...dir };

		const v0 = power * 3.0;
		cueState.body.setLinvel({ x: dir.x * v0, y: dir.y * v0 }, true);

		// 사이드 스핀 (Z축 회전)
		const omegaSide = (offsetSide / 30) * 50.0;
		cueState.body.setAngvel(omegaSide, true);

		// 상하 스핀 (Grok Slip-Friction 모델)
		const pureRollingSpin = v0 / this.BALL_RADIUS_M;
		cueState.forwardSpin = pureRollingSpin * (1.0 + (offsetTop / 30) * 1.5);

		const ballTracks = ballIds.map((id, index) => {
			const pos = allStates[index].body.translation();
			return {
				ballId: id,
				waypoints: [this.toNormalized(pos.x, pos.y)],
				isStopped: false,
				lastPos: { x: pos.x, y: pos.y },
			};
		});

		const MIN_RECORD_DIST_M = 0.01;
		const dt = 1 / 60;

		for (let i = 0; i < maxSteps; i++) {
			this.world.step();
			this.applyFrictionPhysics(dt);

			let anyMoving = false;

			for (let j = 0; j < allStates.length; j++) {
				const state = allStates[j];
				const body = state.body;
				const track = ballTracks[j];
				if (track.isStopped) continue;

				const pos = body.translation();
				const vel = body.linvel();
				const speedSq = vel.x * vel.x + vel.y * vel.y;

				if (isNaN(pos.x) || isNaN(pos.y)) {
					track.isStopped = true;
					continue;
				}

				const dx = pos.x - track.lastPos.x;
				const dy = pos.y - track.lastPos.y;
				const distSq = dx * dx + dy * dy;

				if (distSq >= MIN_RECORD_DIST_M * MIN_RECORD_DIST_M) {
					track.waypoints.push(this.toNormalized(pos.x, pos.y));
					track.lastPos = { x: pos.x, y: pos.y };
				}

				if (speedSq < 0.005 && Math.abs(state.forwardSpin) < 0.5) {
					track.waypoints.push(this.toNormalized(pos.x, pos.y));
					track.isStopped = true;
				} else {
					anyMoving = true;
				}
			}

			if (!anyMoving) break;
		}

		// 상태 복원
		for (let i = 0; i < allStates.length; i++) {
			const state = allStates[i];
			const backup = backupStates[i];
			state.body.setTranslation(backup.translation, true);
			state.body.setRotation(backup.rotation, true);
			state.body.setLinvel(backup.linvel, true);
			state.body.setAngvel(backup.angvel, true);
			state.forwardSpin = backup.forwardSpin;
			state.heading = { ...backup.heading };
		}

		return {
			trajectories: ballTracks.map((t) => ({
				ballId: t.ballId,
				waypoints: t.waypoints,
			})),
		};
	}

	// 바닥 마찰 및 스핀에 의한 선속도 변화 연산
	private applyFrictionPhysics(dt: number) {
		this.balls.forEach((state) => {
			const body = state.body;
			const v = body.linvel();
			const speed = Math.hypot(v.x, v.y);

			if (speed > 0.01) {
				state.heading = { x: v.x / speed, y: v.y / speed };
			}

			const contactSpeed = state.forwardSpin * this.BALL_RADIUS_M;
			const slip = speed - contactSpeed;

			if (Math.abs(slip) > 0.02) {
				const frictionForceMag = this.MU_K * this.MASS * this.GRAVITY;
				const forceDir = -Math.sign(slip);

				const fx = forceDir * frictionForceMag * state.heading.x;
				const fy = forceDir * frictionForceMag * state.heading.y;
				body.addForce({ x: fx, y: fy }, true);

				const torque = forceDir * frictionForceMag * this.BALL_RADIUS_M;
				const alpha = torque / this.I;
				state.forwardSpin -= alpha * dt;
			}
		});
	}

	private toNormalized(metersX: number, metersY: number): Point {
		return {
			x: (metersX / this.TABLE_WIDTH_M) * 1000,
			y: (metersY / this.TABLE_HEIGHT_M) * 1000,
		};
	}
}