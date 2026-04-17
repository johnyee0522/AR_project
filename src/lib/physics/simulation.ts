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
	private readonly BALL_MASS_KG = 0.21;

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
			.setRestitution(0.85)
			.setFriction(0.6);
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
					.setLinearDamping(0.8)
					.setAngularDamping(0.8);
				
				body = this.world.createRigidBody(bodyDesc);
				const colliderDesc = this.rapier.ColliderDesc.ball(this.BALL_RADIUS_M)
					.setRestitution(0.92)
					.setFriction(0.3)
					.setDensity(70.7);
				
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
		offsetSide: number = 0,
		offsetTop: number = 0,
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
		const initialDir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
		const v0 = power * 2.0;
		
		cueBall.setLinvel({ x: initialDir.x * v0, y: initialDir.y * v0 }, true);
		cueBall.setAngvel(offsetSide * 2.0, true);

		const ballTracks = ballIds.map((id, index) => {
			const ball = allBalls[index];
			const pos = ball.translation();
			return {
				ballId: id,
				waypoints: [this.toNormalized(pos.x, pos.y)], 
				isStopped: false,
			};
		});

		let spinEnergy = (offsetTop / 30) * v0;

		for (let i = 0; i < maxSteps; i++) {
			if (Math.abs(spinEnergy) > 0.01) {
				const vel = cueBall.linvel();
				const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
				if (speed > 0.1) {
					const spinForce = spinEnergy * 0.002 * this.BALL_MASS_KG;
					cueBall.applyImpulse({
						x: initialDir.x * spinForce,
						y: initialDir.y * spinForce
					}, true);
				}
				spinEnergy *= 0.97;
			}

			this.world.step();
			let anyMoving = false;

			allBalls.forEach((ball, index) => {
				const track = ballTracks[index];
				if (track.isStopped) return;

				const pos = ball.translation();
				const vel = ball.linvel();
				const speedSq = vel.x * vel.x + vel.y * vel.y;

				if (isNaN(pos.x) || isNaN(pos.y)) {
					track.isStopped = true;
					return;
				}

				track.waypoints.push(this.toNormalized(pos.x, pos.y));
				if (speedSq < 0.001) track.isStopped = true;
				else anyMoving = true;
			});

			if (!anyMoving) break;
		}

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

	private toNormalized(metersX: number, metersY: number): Point {
		return {
			x: (metersX / this.TABLE_WIDTH_M) * 1000,
			y: (metersY / this.TABLE_HEIGHT_M) * 1000,
		};
	}
}
