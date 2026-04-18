import type RAPIER from "@dimforge/rapier2d";
import type { PhysicsResult, Point } from "@/types/physics";

/**
 * Rapier2D를 이용한 물리 시뮬레이션 및 궤적 예측 클래스
 */

interface BallState {
	id: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** 각속도 (wx, wy: 구름/슬라이딩 회전, wz: 사이드 스핀) */
	wx: number;
	wy: number;
	wz: number;
}

export class Simulation {
	private world: RAPIER.World;
	private rapier: typeof RAPIER;
	private balls: Map<string, RAPIER.RigidBody> = new Map();

	// 현실 물리 상수 (국제 경기 규격 기반)
	private readonly TABLE_WIDTH_M = 2.84;
	private readonly TABLE_HEIGHT_M = 1.42;
	private readonly BALL_RADIUS_M = 0.028575; // 57.15mm / 2
	private readonly BALL_MASS_KG = 0.17; // 약 170g
	private readonly MOMENT_OF_INERTIA = 0.4 * 0.17 * (0.028575 ** 2); // (2/5)MR^2

	// 마찰 계수 (현실 물리 기반)
	private readonly G = 9.81;
	private readonly MU_K = 0.21;    // 동마찰 계수 (천 위에서의 슬라이딩)
	private readonly MU_R = 0.015;   // 구름 마찰 계수
	private readonly MU_S = 0.04;    // 스핀 마찰 계수

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

		this.createWall(W / 2, -thickness, W / 2 + thickness, thickness);
		this.createWall(W / 2, H + thickness, W / 2 + thickness, thickness);
		this.createWall(-thickness, H / 2, thickness, H / 2 + thickness);
		this.createWall(W + thickness, H / 2, thickness, H / 2 + thickness);
	}

	private createWall(x: number, y: number, hx: number, hy: number) {
		const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, y);
		const body = this.world.createRigidBody(bodyDesc);
		const colliderDesc = this.rapier.ColliderDesc.cuboid(hx, hy)
			.setRestitution(0)
			.setFriction(0);
		this.world.createCollider(colliderDesc, body);
	}

	public updateBallPositions(ballPositions: Record<string, Point>) {
		for (const [id, pos] of Object.entries(ballPositions)) {
			if (isNaN(pos.x) || isNaN(pos.y)) continue;

			const mX = (pos.x / 1000) * this.TABLE_WIDTH_M;
			const mY = (pos.y / 1000) * this.TABLE_HEIGHT_M;

			let body = this.balls.get(id);
			if (!body) {
				const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
					.setTranslation(mX, mY)
					.setLinearDamping(0)
					.setAngularDamping(0);
				
				body = this.world.createRigidBody(bodyDesc);
				const colliderDesc = this.rapier.ColliderDesc.ball(this.BALL_RADIUS_M)
					.setRestitution(0) // 엔진 반발 끔 (수동 제어)
					.setFriction(0)
					.setDensity(this.BALL_MASS_KG / ( (4/3) * Math.PI * (this.BALL_RADIUS_M**3) ));
				
				this.world.createCollider(colliderDesc, body);
				this.balls.set(id, body);
			} else {
				body.setTranslation({ x: mX, y: mY }, true);
				body.setLinvel({ x: 0, y: 0 }, true);
				body.setAngvel(0, true);
			}
		}
	}

	public predict(
		angleDeg: number,
		power: number,
		maxSteps: number = 300,
		offsetSide: number = 0, // a: -1 ~ 1 (반지름 비율)
		offsetTop: number = 0,  // b: -1 ~ 1 (반지름 비율)
	): PhysicsResult {
		const cueBallBody = this.balls.get("cue");
		if (!cueBallBody) return { trajectories: [] };

		const allBallIds = Array.from(this.balls.keys());
		const ballStates: Map<string, BallState> = new Map();

		for (const id of allBallIds) {
			const body = this.balls.get(id)!;
			const pos = body.translation();
			ballStates.set(id, {
				id, x: pos.x, y: pos.y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0
			});
		}

		const angleRad = (angleDeg * Math.PI) / 180;
		const n = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
		const J_mag = power * 0.5; 
		const J = { x: n.x * J_mag, y: n.y * J_mag };

		const a = offsetSide * this.BALL_RADIUS_M; 
		const b = offsetTop * this.BALL_RADIUS_M;  
		const R = this.BALL_RADIUS_M;
		const M = this.BALL_MASS_KG;
		const I = this.MOMENT_OF_INERTIA;

		const cueState = ballStates.get("cue")!;
		cueState.vx = J.x / M;
		cueState.vy = J.y / M;
		cueState.wx = (-b * J_mag * Math.sin(angleRad)) / I;
		cueState.wy = (b * J_mag * Math.cos(angleRad)) / I;
		cueState.wz = (-a * J_mag) / I;

		const trajectories: Record<string, Point[]> = {};
		const lastPushedPos: Record<string, { x: number; y: number }> = {};
		
		for (const id of allBallIds) {
			const s = ballStates.get(id)!;
			trajectories[id] = [this.toNormalized(s.x, s.y)];
			lastPushedPos[id] = { x: s.x, y: s.y };
		}

		const dt = 1 / 60;

		for (let i = 0; i < maxSteps; i++) {
			let anyMoving = false;
			const collisionHappened: Set<string> = new Set();

			// 3-1. 마찰력 연산
			for (const id of allBallIds) {
				const state = ballStates.get(id)!;
				const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
				const wz_abs = Math.abs(state.wz);

				// 정지 판정 기준 완화 (너무 빨리 사라지는 것 방지)
				if (speed < 0.005 && wz_abs < 0.05 && Math.abs(state.wx) < 0.05 && Math.abs(state.wy) < 0.05) {
					state.vx = 0; state.vy = 0; state.wx = 0; state.wy = 0; state.wz = 0;
					continue;
				}

				anyMoving = true;

				const v_slip_x = state.vx - R * state.wy;
				const v_slip_y = state.vy + R * state.wx;
				const v_slip_mag = Math.sqrt(v_slip_x * v_slip_x + v_slip_y * v_slip_y);

				if (v_slip_mag > 0.01) {
					const fk_mag = this.MU_K * this.G;
					let ax = -fk_mag * (v_slip_x / v_slip_mag);
					let ay = -fk_mag * (v_slip_y / v_slip_mag);

					const max_ax = Math.abs(v_slip_x / dt);
					const max_ay = Math.abs(v_slip_y / dt);
					if (Math.abs(ax) > max_ax) ax = -v_slip_x / dt;
					if (Math.abs(ay) > max_ay) ay = -v_slip_y / dt;

					state.vx += ax * dt;
					state.vy += ay * dt;
					const torque_x = R * (M * ay);
					const torque_y = -R * (M * ax);
					state.wx += (torque_x / I) * dt;
					state.wy += (torque_y / I) * dt;
				} else {
					const fr_mag = this.MU_R * this.G;
					const v_mag = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
					if (v_mag > 0.005) {
						let ax = -fr_mag * (state.vx / v_mag);
						let ay = -fr_mag * (state.vy / v_mag);
						if (Math.abs(ax * dt) > Math.abs(state.vx)) ax = -state.vx / dt;
						if (Math.abs(ay * dt) > Math.abs(state.vy)) ay = -state.vy / dt;
						state.vx += ax * dt;
						state.vy += ay * dt;
						state.wy = state.vx / R;
						state.wx = -state.vy / R;
					} else {
						state.vx = 0; state.vy = 0; state.wx = 0; state.wy = 0;
					}
				}

				if (wz_abs > 0.01) {
					const alpha_z_mag = (5/2) * (this.MU_S * this.G / R);
					let alpha_z = -alpha_z_mag * (state.wz / wz_abs);
					if (Math.abs(alpha_z * dt) > wz_abs) alpha_z = -state.wz / dt;
					state.wz += alpha_z * dt;
				} else {
					state.wz = 0;
				}
			}

			// 3-2. 공-공 충돌
			for (let j = 0; j < allBallIds.length; j++) {
				for (let k = j + 1; k < allBallIds.length; k++) {
					const id1 = allBallIds[j];
					const id2 = allBallIds[k];
					const s1 = ballStates.get(id1)!;
					const s2 = ballStates.get(id2)!;
					const dx = s2.x - s1.x;
					const dy = s2.y - s1.y;
					const distSq = dx * dx + dy * dy;
					const minCheck = R * 2;

					if (distSq < minCheck * minCheck) {
						const dist = Math.sqrt(distSq);
						const nx = dx / dist; const ny = dy / dist;
						const vrx = s1.vx - s2.vx; const vry = s1.vy - s2.vy;
						const vn = vrx * nx + vry * ny;
						if (vn <= 0) continue;
						
						collisionHappened.add(id1);
						collisionHappened.add(id2);

						const COR = 0.96; const MU_BALL = 0.04;
						const jn = (1 + COR) * vn * (M / 2);
						s1.vx -= (jn * nx) / M; s1.vy -= (jn * ny) / M;
						s2.vx += (jn * nx) / M; s2.vy += (jn * ny) / M;
						const tx = -ny; const ty = nx;
						const vt = vrx * tx + vry * ty;
						const jt = vt * MU_BALL * (M / 2);
						s1.vx -= (jt * tx) / M; s1.vy -= (jt * ty) / M;
						s2.vx += (jt * tx) / M; s2.vy += (jt * ty) / M;
						const wz_diff = s1.wz - s2.wz;
						const transfer = wz_diff * 0.05;
						s1.wz -= transfer; s2.wz += transfer;
						const overlap = minCheck - dist;
						s1.x -= nx * overlap * 0.5; s1.y -= ny * overlap * 0.5;
						s2.x += nx * overlap * 0.5; s2.y += ny * overlap * 0.5;
					}
				}
			}

			// 3-3. 공-벽 충돌
			const COR_CUSHION = 0.75; const MU_CUSHION = 0.15;
			for (const id of allBallIds) {
				const s = ballStates.get(id)!;
				let hitWall = false;
				if (s.x < R) { s.x = R; if (s.vx < 0) { s.vx = -s.vx * COR_CUSHION; hitWall = true; } }
				else if (s.x > this.TABLE_WIDTH_M - R) { s.x = this.TABLE_WIDTH_M - R; if (s.vx > 0) { s.vx = -s.vx * COR_CUSHION; hitWall = true; } }
				if (s.y < R) { s.y = R; if (s.vy < 0) { s.vy = -s.vy * COR_CUSHION; hitWall = true; } }
				else if (s.y > this.TABLE_HEIGHT_M - R) { s.y = this.TABLE_HEIGHT_M - R; if (s.vy > 0) { s.vy = -s.vy * COR_CUSHION; hitWall = true; } }
				
				if (hitWall) {
					collisionHappened.add(id);
					// 사이드 스핀 반영 (요약 버전)
					const vt = Math.abs(s.vx) < 0.001 ? s.vx : s.vy; // 대략적인 접선
					s.wz *= 0.95; // 단순 감쇄
				}
			}

			// 3-4. 위치 적분 및 기록 (최적화)
			for (const id of allBallIds) {
				const state = ballStates.get(id)!;
				state.x += state.vx * dt;
				state.y += state.vy * dt;

				const last = lastPushedPos[id];
				const distFromLastSq = (state.x - last.x)**2 + (state.y - last.y)**2;
				
				// 1. 2cm 이상 이동했거나
				// 2. 충돌이 발생했거나
				// 3. 마지막 스텝이라면Waypoint 추가
				if (distFromLastSq > 0.0004 || collisionHappened.has(id) || i === maxSteps - 1) {
					trajectories[id].push(this.toNormalized(state.x, state.y));
					lastPushedPos[id] = { x: state.x, y: state.y };
				}
			}

			if (!anyMoving) break;
		}

		for (const id of allBallIds) {
			const body = this.balls.get(id)!;
			const initialPos = { x: (trajectories[id][0].x / 1000) * this.TABLE_WIDTH_M, y: (trajectories[id][0].y / 1000) * this.TABLE_HEIGHT_M };
			body.setTranslation(initialPos, true);
			body.setLinvel({ x: 0, y: 0 }, true);
			body.setAngvel(0, true);
		}

		return {
			trajectories: Object.entries(trajectories).map(([id, waypoints]) => ({
				ballId: id, waypoints,
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
