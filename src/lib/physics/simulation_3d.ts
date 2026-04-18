import type RAPIER from "@dimforge/rapier3d";
import type { PhysicsResult, Point } from "@/types/physics";

interface SavedState {
	p: RAPIER.Vector;
	r: RAPIER.Rotation;
	lv: RAPIER.Vector;
	av: RAPIER.Vector;
}

/**
 * Rapier3D를 이용한 고도화된 당구 물리 시뮬레이션 클래스
 */
export class Simulation3D {
	private world: RAPIER.World;
	private rapier: typeof RAPIER;
	private balls: Map<string, RAPIER.RigidBody> = new Map();

	private readonly TABLE_WIDTH_M = 2.84;
	private readonly TABLE_HEIGHT_M = 1.42;
	private readonly BALL_RADIUS_M = 0.028575;
	private readonly BALL_MASS_KG = 0.17;
	private readonly G = 9.81;

	private readonly MU_K = 0.21;    // 슬라이딩 마찰 계수
	private readonly MU_R = 0.015;   // 구름 마찰 계수
	private readonly MU_S = 0.04;    // 스핀 감쇄 계수

	constructor(rapier: typeof RAPIER) {
		this.rapier = rapier;
		this.world = new this.rapier.World({ x: 0.0, y: 0.0, z: -this.G });
		this.world.timestep = 1 / 240;
		this.setupTable();
	}

	public destroy() {
		this.world.free();
	}

	private setupTable() {
		const W = this.TABLE_WIDTH_M;
		const H = this.TABLE_HEIGHT_M;
		const R = this.BALL_RADIUS_M;
		const thickness = 0.05; 

		const groundDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(W / 2, H / 2, -thickness);
		const groundBody = this.world.createRigidBody(groundDesc);
		const groundCollider = this.rapier.ColliderDesc.cuboid(W / 2, H / 2, thickness)
			.setFriction(0) 
			.setRestitution(0);
		this.world.createCollider(groundCollider, groundBody);

		const wallThick = 0.05;
		this.createWall(W / 2, -wallThick, R, W / 2, wallThick, R); 
		this.createWall(W / 2, H + wallThick, R, W / 2, wallThick, R); 
		this.createWall(-wallThick, H / 2, R, wallThick, H / 2, R); 
		this.createWall(W + wallThick, H / 2, R, wallThick, H / 2, R); 
	}

	private createWall(x: number, y: number, z: number, hx: number, hy: number, hz: number) {
		const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, y, z);
		const body = this.world.createRigidBody(bodyDesc);
		const colliderDesc = this.rapier.ColliderDesc.cuboid(hx, hy, hz)
			.setRestitution(0.75)
			.setFriction(0.2);
		this.world.createCollider(colliderDesc, body);
	}

	public updateBallPositions(ballPositions: Record<string, Point>) {
		for (const [id, pos] of Object.entries(ballPositions)) {
			if (isNaN(pos.x) || isNaN(pos.y)) continue;

			const mX = (pos.x / 1000) * this.TABLE_WIDTH_M;
			const mY = (pos.y / 1000) * this.TABLE_HEIGHT_M;
			const mZ = this.BALL_RADIUS_M;

			let body = this.balls.get(id);
			if (!body) {
				const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
					.setTranslation(mX, mY, mZ)
					.setLinearDamping(0)
					.setAngularDamping(0)
					.setCcdEnabled(id === "cue"); 
				
				body = this.world.createRigidBody(bodyDesc);
				const colliderDesc = this.rapier.ColliderDesc.ball(this.BALL_RADIUS_M)
					.setRestitution(0.95)
					.setFriction(0)
					.setDensity(this.BALL_MASS_KG / ((4/3) * Math.PI * (this.BALL_RADIUS_M**3)));
				
				this.world.createCollider(colliderDesc, body);
				this.balls.set(id, body);
			} else {
				body.setTranslation({ x: mX, y: mY, z: mZ }, true);
				body.setLinvel({ x: 0, y: 0, z: 0 }, true);
				body.setAngvel({ x: 0, y: 0, z: 0 }, true);
			}
		}
	}

	public predict(
		angleDeg: number,
		power: number,
		maxSteps = 4000, 
		offsetSide = 0,
		offsetTop = 0,
	): PhysicsResult {
		const cueBallBody = this.balls.get("cue");
		if (!cueBallBody) return { trajectories: [] };

		// 수정 1: any 타입 제거 및 명확한 타입 캐스팅
		const states = new Map<string, SavedState>();
		for (const [id, body] of this.balls) {
			states.set(id, {
				p: { ...body.translation() },
				r: { ...body.rotation() },
				lv: { ...body.linvel() },
				av: { ...body.angvel() }
			});
		}

		const angleRad = (angleDeg * Math.PI) / 180;
		const dir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
		const impulseMag = power * 1.2; 
		const impulse = { x: dir.x * impulseMag, y: dir.y * impulseMag, z: 0 };
		
		const r_off = {
			x: -dir.y * (offsetSide / 1000),
			y: dir.x * (offsetSide / 1000),
			z: (offsetTop / 1000)
		};

		cueBallBody.applyImpulse(impulse, true);
		const tImp = {
			x: r_off.y * impulse.z - r_off.z * impulse.y,
			y: r_off.z * impulse.x - r_off.x * impulse.z,
			z: r_off.x * impulse.y - r_off.y * impulse.x
		};
		cueBallBody.applyTorqueImpulse(tImp, true);

		const trajectories: Record<string, Point[]> = {};
		const lastVel: Record<string, { x: number, y: number }> = {};

		for (const id of this.balls.keys()) {
			const body = this.balls.get(id)!;
			const p = body.translation();
			const v = body.linvel();
			trajectories[id] = [this.toNormalized(p.x, p.y)];
			lastVel[id] = { x: v.x, y: v.y };
		}

		const dt = 1 / 240; 
		const R = this.BALL_RADIUS_M;

		for (let i = 0; i < maxSteps; i++) {
			this.world.step();
			let worldMoving = false;

			for (const [id, body] of this.balls) {
				const p = body.translation();
				const v = body.linvel();
				const w = body.angvel();

				const vsx = v.x - w.y * R;
				const vsy = v.y + w.x * R;
				const vs_mag = Math.sqrt(vsx * vsx + vsy * vsy);

				let isThisBallMoving = false;

				if (vs_mag > 0.005) {
					let f_mag = this.MU_K * this.G * dt;
					if (f_mag > vs_mag / 3.5) f_mag = vs_mag / 3.5;

					const f_dir = { x: vsx / vs_mag, y: vsy / vs_mag };
					const dvx = -f_dir.x * f_mag;
					const dvy = -f_dir.y * f_mag;
					
					body.setLinvel({ x: v.x + dvx, y: v.y + dvy, z: v.z }, true);
					
					const dwx = (2.5 / R) * dvy;
					const dwy = -(2.5 / R) * dvx;
					body.setAngvel({ x: w.x + dwx, y: w.y + dwy, z: w.z }, true);
					isThisBallMoving = true;
				} else {
					const speed = Math.sqrt(v.x * v.x + v.y * v.y);
					if (speed > 0.005) {
						let f_mag = this.MU_R * this.G * dt;
						if (f_mag > speed) f_mag = speed; 

						const ratio = (speed - f_mag) / speed;
						body.setLinvel({ x: v.x * ratio, y: v.y * ratio, z: v.z }, true);
						
						// 수정 2: 클래스 인스턴스 전개(Spread) 오류 방지
						body.setAngvel({ x: -v.y / R, y: v.x / R, z: w.z }, true);
						isThisBallMoving = true;
					} else {
						body.setLinvel({ x: 0, y: 0, z: 0 }, true);
						body.setAngvel({ x: 0, y: 0, z: 0 }, true);
					}
				}

				const wz_abs = Math.abs(w.z);
				if (wz_abs > 0.005) {
					let alpha_z = (5 / 2) * (this.MU_S * this.G / R) * dt;
					if (alpha_z > wz_abs) alpha_z = wz_abs; 
					const next_wz = w.z > 0 ? w.z - alpha_z : w.z + alpha_z;
					// 수정 2: 구조분해할당 제거하고 명확히 매핑
					body.setAngvel({ x: w.x, y: w.y, z: next_wz }, true);
				}

				if (isThisBallMoving) worldMoving = true;

				const v_new = body.linvel();
				const dvx = v_new.x - lastVel[id].x;
				const dvy = v_new.y - lastVel[id].y;
				const isCollision = (dvx*dvx + dvy*dvy) > 0.01;

				if (isThisBallMoving && (i % 16 === 0 || isCollision)) {
					trajectories[id].push(this.toNormalized(p.x, p.y));
				}
				lastVel[id] = { x: v_new.x, y: v_new.y };
			}

			if (!worldMoving) break;
		}

		for (const [id, body] of this.balls) {
			const s = states.get(id)!;
			body.setTranslation(s.p, true);
			body.setRotation(s.r, true);
			body.setLinvel(s.lv, true);
			body.setAngvel(s.av, true);
		}

		return {
			trajectories: Object.entries(trajectories).map(([id, waypoints]) => ({
				ballId: id,
				waypoints,
			})),
		};
	}

	private toNormalized(mx: number, my: number): Point {
		return {
			x: (mx / this.TABLE_WIDTH_M) * 1000,
			y: (my / this.TABLE_HEIGHT_M) * 1000,
		};
	}
}