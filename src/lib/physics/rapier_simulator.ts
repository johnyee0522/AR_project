import RAPIER, { Vector3 } from "@dimforge/rapier3d";
import type {
	BallTrajectory,
	MeterPoint,
	PhysicsEvent,
	PhysicsResult,
	Point,
} from "@/types/physics";
import {
	BALL_RADIUS_M,
	TABLE_HEIGHT_M,
	TABLE_WIDTH_M,
} from "./physics_constants";
import { clamp, distance } from "./vector2";

type RapierSimulationConfig = {
	table: {
		width: number;
		height: number;
	};
	ball: {
		count: number;
		radius: number;
	};
	physics: {
		timeStep: number;
	};
};

type CubitObject = {
	rigidbody: RAPIER.RigidBody;
	collider: RAPIER.Collider;
};

type RapierTrajectory = {
	target: Vector3;
	others: Vector3[];
};

const INTERNAL_CUE_BALL_ID = "cueBall";
const DEFAULT_MAX_STEPS = 600;
const MIN_POWER = 0;
const MAX_POWER = 3;
const WAYPOINT_INTERVAL = 16;
const MIN_WAYPOINT_DISTANCE_M = 0.002;

export const RAPIER_SIMULATION_TUNING_VERSION = "cue-bit-rapier-0.19.3";

class CueBitRapierSimulator {
	private config: RapierSimulationConfig;
	private world: RAPIER.World;
	private targetBall: CubitObject;
	private otherBalls: CubitObject[];

	public constructor(config: RapierSimulationConfig) {
		this.config = config;
		this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
		this.world.timestep = config.physics.timeStep;

		// ground
		this.createWall(
			new RAPIER.Vector3(
				config.table.width / 2,
				-0.5,
				config.table.height / 2,
			),
			new RAPIER.Vector3(config.table.width, 1, config.table.height),
		);
		// left
		this.createWall(
			new RAPIER.Vector3(-1, 0, config.table.height / 2),
			new RAPIER.Vector3(1, 1, config.table.height),
		);
		// right
		this.createWall(
			new RAPIER.Vector3(config.table.width + 1, 0, config.table.height / 2),
			new RAPIER.Vector3(1, 1, config.table.height),
		);
		// top
		this.createWall(
			new RAPIER.Vector3(config.table.width / 2, 0, -1),
			new RAPIER.Vector3(config.table.width, 1, 1),
		);
		// bottom
		this.createWall(
			new RAPIER.Vector3(config.table.width / 2, 0, config.table.height + 1),
			new RAPIER.Vector3(config.table.width, 1, 1),
		);

		this.targetBall = this.createBall(config.ball.radius);
		this.otherBalls = Array.from({ length: config.ball.count - 1 }, () =>
			this.createBall(config.ball.radius),
		);
	}

	private createWall(position: RAPIER.Vector3, size: RAPIER.Vector3) {
		const rigidbody = this.world.createRigidBody(
			RAPIER.RigidBodyDesc.fixed().setTranslation(
				position.x,
				position.y,
				position.z,
			),
		);
		const collider = this.world.createCollider(
			RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z)
				.setRestitution(0.7)
				.setFriction(0.25),
			rigidbody,
		);

		return { rigidbody, collider };
	}

	private createBall(radius: number) {
		const rigidbody = this.world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setCcdEnabled(true)
				.setTranslation(0, 0, 0),
		);

		const collider = this.world.createCollider(
			RAPIER.ColliderDesc.ball(radius)
				.setRestitution(0.9)
				.setFriction(0.2)
				.setDensity(1700),
			rigidbody,
		);

		return { rigidbody, collider };
	}

	public simulate(
		targetBallPosition: Point,
		otherBallPositions: Point[],
		angle: number,
		power: number,
		_hitPoint: Point,
	): [RapierTrajectory, () => RapierTrajectory] {
		if (otherBallPositions.length > this.otherBalls.length) {
			throw new Error("Too many balls");
		}

		this.targetBall.rigidbody.setTranslation(
			new Vector3(
				targetBallPosition.x,
				this.config.ball.radius / 2,
				targetBallPosition.y,
			),
			true,
		);
		this.targetBall.rigidbody.setLinvel(new Vector3(0, 0, 0), true);
		this.targetBall.rigidbody.setAngvel(new Vector3(0, 0, 0), true);
		this.targetBall.rigidbody.resetForces(true);
		this.targetBall.rigidbody.resetTorques(true);
		this.otherBalls.forEach((ball, i) => {
			if (i < otherBallPositions.length) {
				const position = otherBallPositions[i];
				ball.rigidbody.setTranslation(
					new Vector3(position.x, this.config.ball.radius / 2, position.y),
					true,
				);
				ball.rigidbody.setLinvel(new Vector3(0, 0, 0), true);
				ball.rigidbody.setAngvel(new Vector3(0, 0, 0), true);
				ball.rigidbody.resetForces(true);
				ball.rigidbody.resetTorques(true);
			} else {
				// Move unused balls below the table so they do not affect simulation.
				ball.rigidbody.setTranslation(new Vector3(0, -100, 0), false);
			}
		});

		const initialTrajectory: RapierTrajectory = {
			target: this.targetBall.rigidbody.translation(),
			others: this.otherBalls.map((ball) => ball.rigidbody.translation()),
		};
		this.targetBall.rigidbody.applyImpulse(
			new Vector3(power * Math.cos(angle), 0, power * Math.sin(angle)),
			true,
		);

		return [
			initialTrajectory,
			() => {
				this.world.step();

				return {
					target: this.targetBall.rigidbody.translation(),
					others: this.otherBalls.map((ball) => ball.rigidbody.translation()),
				};
			},
		];
	}
}

export class RapierPhysicsSimulator {
	private simulator: CueBitRapierSimulator | null = null;
	private simulatorBallCount = 0;
	private ballPositions: Record<string, Point> = {};

	public updateBallPositionsMeters(ballPositions: Record<string, Point>): void {
		this.ballPositions = {};

		for (const [id, point] of Object.entries(ballPositions)) {
			if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;

			this.ballPositions[id] = {
				x: clamp(point.x, BALL_RADIUS_M, TABLE_WIDTH_M - BALL_RADIUS_M),
				y: clamp(point.y, BALL_RADIUS_M, TABLE_HEIGHT_M - BALL_RADIUS_M),
			};
		}
	}

	public predict(
		angleDeg: number,
		power: number,
		maxSteps = DEFAULT_MAX_STEPS,
		offsetSide = 0,
		offsetTop = 0,
	): PhysicsResult {
		const cueBallPosition = this.ballPositions[INTERNAL_CUE_BALL_ID];
		if (!cueBallPosition) return this.emptyResult();

		const otherEntries = Object.entries(this.ballPositions).filter(
			([id]) => id !== INTERNAL_CUE_BALL_ID,
		);
		const ballIds = [
			INTERNAL_CUE_BALL_ID,
			...otherEntries.map(([id]) => id),
		];
		const simulator = this.ensureSimulator(ballIds.length);
		const safeAngleRad = (this.normalizeAngleDeg(angleDeg) * Math.PI) / 180;
		const safePower = clamp(
			Number.isFinite(power) ? power : 0,
			MIN_POWER,
			MAX_POWER,
		);
		const safeMaxSteps =
			Number.isFinite(maxSteps) && maxSteps > 0
				? Math.max(1, Math.floor(maxSteps))
				: DEFAULT_MAX_STEPS;

		const [initialTrajectory, step] = simulator.simulate(
			cueBallPosition,
			otherEntries.map(([, point]) => point),
			safeAngleRad,
			safePower,
			{
				x: Number.isFinite(offsetSide) ? offsetSide : 0,
				y: Number.isFinite(offsetTop) ? offsetTop : 0,
			},
		);

		const initialPositions = this.toMeterPoints(
			initialTrajectory,
			otherEntries.length,
		);
		const trajectories = this.createTrajectoryMap(ballIds, initialPositions);
		const travelDistanceByBall = this.createZeroDistanceMap(ballIds);
		const lastPositions = this.createPositionMap(ballIds, initialPositions);

		let stepCount = 0;
		for (let stepIndex = 1; stepIndex <= safeMaxSteps; stepIndex++) {
			const currentPositions = this.toMeterPoints(
				step(),
				otherEntries.length,
			);
			stepCount = stepIndex;

			for (let i = 0; i < ballIds.length; i++) {
				const ballId = ballIds[i];
				const position = currentPositions[i];
				const lastPosition = lastPositions[ballId];
				travelDistanceByBall[ballId] += distance(lastPosition, position);
				lastPositions[ballId] = position;

				if (
					stepIndex % WAYPOINT_INTERVAL === 0 ||
					distance(trajectories[ballId].at(-1) ?? position, position) >
						MIN_WAYPOINT_DISTANCE_M
				) {
					trajectories[ballId].push(position);
				}
			}
		}

		for (const ballId of ballIds) {
			this.appendFinalWaypoint(trajectories[ballId], lastPositions[ballId]);
		}

		const trajectoryList = ballIds.map((ballId): BallTrajectory => {
			return {
				ballId,
				waypoints: trajectories[ballId],
			};
		});
		const finalPositions = { ...lastPositions };
		const trajectoryDistanceByBall =
			this.calculateTrajectoryDistanceByBall(trajectoryList);
		const events: PhysicsEvent[] = [];

		return this.toPublicResult(trajectoryList, events, {
			stepCount,
			stopped: false,
			travelDistanceByBall,
			trajectoryDistanceByBall,
			finalPositions,
		});
	}

	private ensureSimulator(ballCount: number): CueBitRapierSimulator {
		if (this.simulator && this.simulatorBallCount >= ballCount) {
			return this.simulator;
		}

		this.simulatorBallCount = ballCount;
		this.simulator = new CueBitRapierSimulator({
			table: {
				width: TABLE_WIDTH_M,
				height: TABLE_HEIGHT_M,
			},
			ball: {
				count: ballCount,
				radius: BALL_RADIUS_M,
			},
			physics: {
				timeStep: 1 / 60,
			},
		});
		return this.simulator;
	}

	private toMeterPoints(
		trajectory: RapierTrajectory,
		activeOtherCount: number,
	): MeterPoint[] {
		return [
			this.toMeterPoint(trajectory.target),
			...trajectory.others
				.slice(0, activeOtherCount)
				.map((position) => this.toMeterPoint(position)),
		];
	}

	private toMeterPoint(position: Vector3): MeterPoint {
		return {
			x: position.x,
			y: position.z,
		};
	}

	private createTrajectoryMap(
		ballIds: string[],
		positions: MeterPoint[],
	): Record<string, MeterPoint[]> {
		const trajectories: Record<string, MeterPoint[]> = {};

		for (let i = 0; i < ballIds.length; i++) {
			trajectories[ballIds[i]] = [{ ...positions[i] }];
		}

		return trajectories;
	}

	private createZeroDistanceMap(ballIds: string[]): Record<string, number> {
		const distances: Record<string, number> = {};

		for (const ballId of ballIds) {
			distances[ballId] = 0;
		}

		return distances;
	}

	private createPositionMap(
		ballIds: string[],
		positions: MeterPoint[],
	): Record<string, MeterPoint> {
		const mapped: Record<string, MeterPoint> = {};

		for (let i = 0; i < ballIds.length; i++) {
			mapped[ballIds[i]] = { ...positions[i] };
		}

		return mapped;
	}

	private appendFinalWaypoint(
		waypoints: MeterPoint[],
		position: MeterPoint,
	): void {
		const last = waypoints.at(-1);
		if (!last || distance(last, position) > 0) {
			waypoints.push({ ...position });
		}
	}

	private calculateTrajectoryDistanceByBall(
		trajectories: BallTrajectory[],
	): Record<string, number> {
		const distances: Record<string, number> = {};

		for (const trajectory of trajectories) {
			let total = 0;
			for (let i = 1; i < trajectory.waypoints.length; i++) {
				total += distance(
					trajectory.waypoints[i - 1],
					trajectory.waypoints[i],
				);
			}
			distances[trajectory.ballId] = total;
		}

		return distances;
	}

	private normalizeAngleDeg(angleDeg: number): number {
		if (!Number.isFinite(angleDeg)) return 0;
		return ((angleDeg % 360) + 360) % 360;
	}

	private emptyResult(): PhysicsResult {
		return this.toPublicResult([], [], {
			stepCount: 0,
			stopped: true,
			travelDistanceByBall: {},
			finalPositions: {},
		});
	}

	private toPublicResult(
		trajectories: BallTrajectory[],
		events: PhysicsEvent[],
		summary: PhysicsResult["summary"],
	): PhysicsResult {
		return {
			balls: this.getBallResults(trajectories, summary.finalPositions),
			collisions: events.map((event) => ({
				type: event.type,
				position: event.position,
				ballId: event.ballId,
				otherBallId: event.otherBallId,
				cushionSide: event.cushionSide,
			})),
			trajectories,
			events,
			summary,
		};
	}

	private getBallResults(
		trajectories: BallTrajectory[],
		finalPositions: Record<string, Point>,
	): PhysicsResult["balls"] {
		const balls: PhysicsResult["balls"] = {};

		for (const trajectory of trajectories) {
			const start = trajectory.waypoints[0];
			if (!start) continue;
			balls[trajectory.ballId] = {
				start,
				end: finalPositions[trajectory.ballId] ?? start,
			};
		}

		return balls;
	}
}
