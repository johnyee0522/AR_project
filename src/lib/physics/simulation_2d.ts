import type {
	CushionSide,
	PhysicsEvent,
	PhysicsResult,
	Point,
} from "@/types/physics";
import {
	BALL_RADIUS_M,
	GRAVITY,
	NORMALIZED_SIZE,
	POSITION_MARGIN_M,
	TABLE_HEIGHT_M,
	TABLE_WIDTH_M,
} from "./physics_constants";
import {
	clamp,
	distance,
	dot,
	length,
	normalize,
	scale,
	sub,
	type Vec2,
} from "./vector2";

export interface Simulation2DTuning {
	impulseScale: number;
	rollingFriction: number;
	spinFriction: number;
	ballRestitution: number;
	cushionRestitution: number;
	cushionSpinTransfer: number;
	ballSpinTransfer: number;
	followDrawTransfer: number;
	spinInputReferenceMm: number;
	maxSpinRatio: number;
	sideSpinStrength: number;
	topSpinStrength: number;
	stopSpeed: number;
	spinStopSpeed: number;
	dt: number;
}

export const DEFAULT_SIMULATION_2D_TUNING: Simulation2DTuning = {
	// 타격 강도를 실제 초기 속도로 바꾸는 배율
	impulseScale: 1.2,
	// 공이 굴러가며 느려지는 정도
	rollingFriction: 0.05,
	// 좌우/상하 스핀이 시간에 따라 줄어드는 정도
	spinFriction: 0.04,
	// 공끼리 부딪힐 때 튕기는 정도
	ballRestitution: 0.95,
	// 공이 쿠션에 맞고 튕기는 정도
	cushionRestitution: 0.75,
	// 좌우 스핀이 쿠션 반사에 주는 영향
	cushionSpinTransfer: 0.04,
	// 좌우 스핀이 공-공 충돌에 주는 영향
	ballSpinTransfer: 0.01,
	// 상/하 스핀이 충돌 후 수구 움직임에 주는 영향
	followDrawTransfer: 0.28,
	// UI에서 입력한 스핀 거리(mm)를 내부 스핀 비율로 바꾸는 기준값
	spinInputReferenceMm: 60,
	// 기준값보다 큰 스핀 입력을 허용할 때의 최대 스핀 비율
	maxSpinRatio: 2,
	// 좌/우 스핀 효과를 전체적으로 강하게 또는 약하게 만드는 배율
	sideSpinStrength: 1.8,
	// 상/하 스핀 효과를 전체적으로 강하게 또는 약하게 만드는 배율
	topSpinStrength: 1,
	// 이 속도보다 느리면 공이 멈춘 것으로 판단
	stopSpeed: 0.005,
	// 이 값보다 작으면 스핀이 없는 것으로 판단
	spinStopSpeed: 0.01,
	// 시뮬레이션 한 스텝의 시간 간격
	dt: 1 / 240,
};

// 내부 시뮬레이션 상태는 2.84m x 1.42m 당구대 위의 meter 단위로 저장
// 외부 입출력은 UI/AR 코드가 단순하게 유지되도록 0~1000 정규화 좌표를 사용
interface BallState {
	id: string;
	position: Vec2;
	velocity: Vec2;
	sideSpin: number;
	topSpin: number;
}

interface SavedState {
	balls: Map<string, BallState>;
}

export class Simulation2D {
	private tuning: Simulation2DTuning;
	private balls: Map<string, BallState> = new Map();

	constructor(tuning: Partial<Simulation2DTuning> = {}) {
		this.tuning = { ...DEFAULT_SIMULATION_2D_TUNING, ...tuning };
	}

	public destroy() {
		this.balls.clear();
	}

	public updateBallPositions(ballPositions: Record<string, Point>): void {
		const liveIds = new Set(Object.keys(ballPositions));

		for (const [id, pos] of Object.entries(ballPositions)) {
			if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;

			const position = this.clampToTable(this.toMeter(pos));
			const existing = this.balls.get(id);
			if (existing) {
				existing.position = position;
				existing.velocity = { x: 0, y: 0 };
				existing.sideSpin = 0;
				existing.topSpin = 0;
			} else {
				this.balls.set(id, {
					id,
					position,
					velocity: { x: 0, y: 0 },
					sideSpin: 0,
					topSpin: 0,
				});
			}
		}

		for (const id of this.balls.keys()) {
			if (!liveIds.has(id)) this.balls.delete(id);
		}
	}

	public predict(
		angleDeg: number,
		power: number,
		maxSteps = 1200,
		offsetSide = 0,
		offsetTop = 0,
	): PhysicsResult {
		const cue = this.balls.get("cue");
		if (!cue) return this.emptyResult();

		// 예측 중에는 속도를 위해 월드 상태를 직접 변경
		// 예측이 끝나면 원래 상태로 복구해서 렌더 루프에서 반복 호출해도 결과가 안정적
		const saved = this.saveState();
		const angleRad = (angleDeg * Math.PI) / 180;
		const shotDir = normalize({ x: Math.cos(angleRad), y: Math.sin(angleRad) });

		cue.velocity = scale(shotDir, power * this.tuning.impulseScale);
		cue.sideSpin =
			this.normalizeTipOffset(offsetSide) * this.tuning.sideSpinStrength;
		cue.topSpin =
			this.normalizeTipOffset(offsetTop) * this.tuning.topSpinStrength;

		const trajectories: Record<string, Point[]> = {};
		const events: PhysicsEvent[] = [];
		const seenContacts = new Set<string>();
		const travelDistanceByBall: Record<string, number> = {};
		const lastPositions: Record<string, Vec2> = {};

		for (const [id, ball] of this.balls) {
			trajectories[id] = [this.toNormalized(ball.position)];
			travelDistanceByBall[id] = 0;
			lastPositions[id] = { ...ball.position };
		}

		let stepCount = 0;
		let stopped = false;
		for (let step = 1; step <= maxSteps; step++) {
			const moving = this.stepSimulation(
				step,
				trajectories,
				events,
				seenContacts,
				travelDistanceByBall,
				lastPositions,
				shotDir,
			);
			stepCount = step;
			if (!moving) {
				stopped = true;
				break;
			}
		}

		// 렌더러는 waypoint 사이를 직선으로 이어 점선을 그림
		// 실제 이동거리와 점선 길이가 맞도록 마지막 정지 위치를 반드시 포함
		this.appendFinalWaypoints(trajectories);
		const trajectoryDistanceByBall =
			this.calculateTrajectoryDistanceByBall(trajectories);

		this.restoreState(saved);

		const firstCueBallHit = events.find(
			(event) => event.type === "ball-collision" && event.ballId === "cue",
		);
		const firstCueCushionHit = events.find(
			(event) => event.type === "cushion-hit" && event.ballId === "cue",
		);

		return {
			trajectories: Object.entries(trajectories).map(([ballId, waypoints]) => ({
				ballId,
				waypoints,
			})),
			events,
			summary: {
				stepCount,
				stopped,
				firstHitBallId: firstCueBallHit?.otherBallId,
				firstCushionSide: firstCueCushionHit?.cushionSide,
				travelDistanceByBall,
				trajectoryDistanceByBall,
			},
		};
	}

	private stepSimulation(
		step: number,
		trajectories: Record<string, Point[]>,
		events: PhysicsEvent[],
		seenContacts: Set<string>,
		travelDistanceByBall: Record<string, number>,
		lastPositions: Record<string, Vec2>,
		shotDir: Vec2,
	): boolean {
		// 먼저 모든 공을 이동시키고, 이동 중 쿠션 충돌은 연속 충돌 방식으로 처리
		for (const ball of this.balls.values()) {
			this.advanceBall(ball, this.tuning.dt, step, events, seenContacts);
		}

		// 공-공 충돌은 이전 위치와 현재 위치 사이를 훑어서 검사
		// 빠른 공이나 얇은 두께 충돌을 놓칠 가능성을 줄이기 위함
		this.resolveBallCollisions(
			step,
			events,
			seenContacts,
			shotDir,
			lastPositions,
		);

		for (const [id, ball] of this.balls) {
			const lastPosition = lastPositions[id] ?? ball.position;
			travelDistanceByBall[id] =
				(travelDistanceByBall[id] ?? 0) + distance(lastPosition, ball.position);
			lastPositions[id] = { ...ball.position };

			if (step % 16 === 0 || this.hasRecentEvent(events, step, id)) {
				this.appendWaypointIfMoved(trajectories, id, ball.position);
			}
		}

		return this.isWorldMoving();
	}

	private appendFinalWaypoints(trajectories: Record<string, Point[]>): void {
		for (const [id, ball] of this.balls) {
			this.appendWaypointIfMoved(trajectories, id, ball.position, 0);
		}
	}

	private appendWaypointIfMoved(
		trajectories: Record<string, Point[]>,
		ballId: string,
		position: Vec2,
		minDistance = 0.002,
	): void {
		const waypoints = trajectories[ballId];
		if (!waypoints) return;

		const lastWaypoint = waypoints.at(-1);
		if (
			!lastWaypoint ||
			distance(this.toMeter(lastWaypoint), position) > minDistance
		) {
			waypoints.push(this.toNormalized(position));
		}
	}

	private calculateTrajectoryDistanceByBall(
		trajectories: Record<string, Point[]>,
	): Record<string, number> {
		const distances: Record<string, number> = {};

		for (const [id, waypoints] of Object.entries(trajectories)) {
			let total = 0;
			for (let i = 1; i < waypoints.length; i++) {
				total += distance(
					this.toMeter(waypoints[i - 1]),
					this.toMeter(waypoints[i]),
				);
			}
			distances[id] = total;
		}

		return distances;
	}

	private advanceBall(
		ball: BallState,
		duration: number,
		step: number,
		events: PhysicsEvent[],
		seenContacts: Set<string>,
	): void {
		let remainingTime = duration;
		let collisionCount = 0;
		const maxCollisionsPerStep = 4;

		// 한 프레임 안에서도 쿠션에 맞고 다시 움직일 수 있습니다.
		// 충돌 시점까지의 시간만 먼저 사용하고, 반사 후 남은 시간만큼 계속 진행합니다.
		while (remainingTime > 1e-6 && collisionCount <= maxCollisionsPerStep) {
			const eventCountBefore = events.length;
			const usedTime = this.advanceBallSegment(
				ball,
				remainingTime,
				step,
				events,
				seenContacts,
			);
			this.decaySpin(ball, usedTime);
			remainingTime -= usedTime;

			if (events.length === eventCountBefore || !this.isBallMoving(ball)) {
				break;
			}
			collisionCount++;
		}

		if (remainingTime > 1e-6) {
			this.decaySpin(ball, remainingTime);
		}
	}

	private advanceBallSegment(
		ball: BallState,
		timeLeft: number,
		step: number,
		events: PhysicsEvent[],
		seenContacts: Set<string>,
	): number {
		const speed = length(ball.velocity);
		if (speed <= 0) return timeLeft;

		const direction = scale(ball.velocity, 1 / speed);
		const deceleration = this.tuning.rollingFriction * GRAVITY;
		const maxTravel = this.travelDistance(speed, deceleration, timeLeft);
		const impact = this.findNextCushionImpact(ball, direction, maxTravel);

		// 이 구간 안에 쿠션 충돌이 없으면 전체 시간 동안 등가속도 감속 이동을 적용합니다.
		if (!impact) {
			ball.position = {
				x: ball.position.x + direction.x * maxTravel,
				y: ball.position.y + direction.y * maxTravel,
			};
			const nextSpeed = this.speedAfter(speed, deceleration, timeLeft);
			ball.velocity = nextSpeed > 0 ? scale(direction, nextSpeed) : { x: 0, y: 0 };
			return timeLeft;
		}

		// 이 구간 안에 쿠션 충돌이 있으면 정확한 접촉 지점까지 이동
		// 그동안 줄어든 속도를 반영한 뒤 쿠션에서 반사
		const impactTime = this.timeForTravel(speed, deceleration, impact.travel);
		ball.position = {
			x: ball.position.x + direction.x * impact.travel,
			y: ball.position.y + direction.y * impact.travel,
		};
		ball.velocity = scale(
			direction,
			this.speedAfter(speed, deceleration, impactTime),
		);
		this.reflectCushion(ball, impact.side, step, events, seenContacts);
		return Math.max(0, Math.min(timeLeft, impactTime));
	}

	private findNextCushionImpact(
		ball: BallState,
		direction: Vec2,
		maxTravel: number,
	): { side: CushionSide; travel: number } | null {
		const minX = BALL_RADIUS_M;
		const maxX = TABLE_WIDTH_M - BALL_RADIUS_M;
		const minY = BALL_RADIUS_M;
		const maxY = TABLE_HEIGHT_M - BALL_RADIUS_M;
		let closest: { side: CushionSide; travel: number } | null = null;

		if (direction.x < -1e-8) {
			closest = this.pickCloserImpact(closest, {
				side: "left",
				travel: (minX - ball.position.x) / direction.x,
			});
		} else if (direction.x > 1e-8) {
			closest = this.pickCloserImpact(closest, {
				side: "right",
				travel: (maxX - ball.position.x) / direction.x,
			});
		}

		if (direction.y < -1e-8) {
			closest = this.pickCloserImpact(closest, {
				side: "top",
				travel: (minY - ball.position.y) / direction.y,
			});
		} else if (direction.y > 1e-8) {
			closest = this.pickCloserImpact(closest, {
				side: "bottom",
				travel: (maxY - ball.position.y) / direction.y,
			});
		}

		if (!closest || closest.travel < 0 || closest.travel > maxTravel) return null;
		return closest;
	}

	private pickCloserImpact(
		current: { side: CushionSide; travel: number } | null,
		next: { side: CushionSide; travel: number },
	): { side: CushionSide; travel: number } | null {
		if (!Number.isFinite(next.travel) || next.travel < 0) return current;
		if (!current || next.travel < current.travel) return next;
		return current;
	}

	private reflectCushion(
		ball: BallState,
		side: CushionSide,
		step: number,
		events: PhysicsEvent[],
		seenContacts: Set<string>,
	): void {
		if (side === "left" || side === "right") {
			this.reflectVerticalCushion(ball, side, step, events, seenContacts);
			return;
		}
		this.reflectHorizontalCushion(ball, side, step, events, seenContacts);
	}

	private travelDistance(
		speed: number,
		deceleration: number,
		duration: number,
	): number {
		// 등가속도 감속 이동거리 공식 s = vt - 1/2at^2
		// 공이 중간에 멈추면 멈춘 시점까지만 계산
		if (duration <= 0 || speed <= 0) return 0;
		if (deceleration <= 0) return speed * duration;

		const stopTime = speed / deceleration;
		const t = Math.min(duration, stopTime);
		return speed * t - 0.5 * deceleration * t * t;
	}

	private speedAfter(
		speed: number,
		deceleration: number,
		duration: number,
	): number {
		if (deceleration <= 0) return speed;
		return Math.max(0, speed - deceleration * duration);
	}

	private timeForTravel(
		speed: number,
		deceleration: number,
		travel: number,
	): number {
		// travelDistance의 역계산. 특정 거리까지 도달하는 시간을 구함
		if (travel <= 0 || speed <= 0) return 0;
		if (deceleration <= 0) return travel / speed;

		const discriminant = speed * speed - 2 * deceleration * travel;
		if (discriminant <= 0) return speed / deceleration;
		return (speed - Math.sqrt(discriminant)) / deceleration;
	}

	private decaySpin(ball: BallState, duration: number): void {
		if (duration <= 0) return;

		const spinDecay = (5 / 2) * this.tuning.spinFriction * GRAVITY * duration;
		ball.sideSpin = this.decayTowardZero(ball.sideSpin, spinDecay);
		ball.topSpin = this.decayTowardZero(ball.topSpin, spinDecay);
	}

	private isBallMoving(ball: BallState): boolean {
		return (
			length(ball.velocity) > this.tuning.stopSpeed ||
			Math.abs(ball.sideSpin) > this.tuning.spinStopSpeed ||
			Math.abs(ball.topSpin) > this.tuning.spinStopSpeed
		);
	}

	private reflectVerticalCushion(
		ball: BallState,
		side: CushionSide,
		step: number,
		events: PhysicsEvent[],
		seenContacts: Set<string>,
	): void {
		if ((side === "left" && ball.velocity.x >= 0) || (side === "right" && ball.velocity.x <= 0)) {
			return;
		}

		ball.velocity.x = -ball.velocity.x * this.tuning.cushionRestitution;
		// 좌우 스핀은 쿠션 충돌 후 접선 방향 속도에만 영향을 줌
		// 스핀이 없으면 접선 방향 속도는 의도적으로 그대로 둠
		if (Math.abs(ball.sideSpin) > this.tuning.spinStopSpeed) {
			ball.velocity.y +=
				ball.sideSpin * this.tuning.cushionSpinTransfer * Math.abs(ball.velocity.x);
		}
		this.recordCushionEvent(ball, side, step, events, seenContacts);
	}

	private reflectHorizontalCushion(
		ball: BallState,
		side: CushionSide,
		step: number,
		events: PhysicsEvent[],
		seenContacts: Set<string>,
	): void {
		if ((side === "top" && ball.velocity.y >= 0) || (side === "bottom" && ball.velocity.y <= 0)) {
			return;
		}

		ball.velocity.y = -ball.velocity.y * this.tuning.cushionRestitution;
		// 좌우 스핀은 쿠션 충돌 후 접선 방향 속도에만 영향을 줌
		// 스핀이 없으면 접선 방향 속도는 의도적으로 그대로 둠
		if (Math.abs(ball.sideSpin) > this.tuning.spinStopSpeed) {
			ball.velocity.x +=
				ball.sideSpin * this.tuning.cushionSpinTransfer * Math.abs(ball.velocity.y);
		}
		this.recordCushionEvent(ball, side, step, events, seenContacts);
	}

	private resolveBallCollisions(
		step: number,
		events: PhysicsEvent[],
		seenContacts: Set<string>,
		shotDir: Vec2,
		lastPositions: Record<string, Vec2>,
	): void {
		const balls = [...this.balls.values()];
		for (let i = 0; i < balls.length; i++) {
			for (let j = i + 1; j < balls.length; j++) {
				const a = balls[i];
				const b = balls[j];
				const minDist = BALL_RADIUS_M * 2;
				// 이전 위치부터 현재 위치까지 두 공의 이동 경로를 훑어봄
				// 깊게 겹친 뒤가 아니라 처음 닿는 순간에 충돌을 처리하기 위함
				const impact = this.findBallImpact(
					a,
					b,
					lastPositions[a.id] ?? a.position,
					lastPositions[b.id] ?? b.position,
					minDist,
				);
				if (!impact) continue;

				if (impact.time < 1) {
					const prevA = lastPositions[a.id] ?? a.position;
					const prevB = lastPositions[b.id] ?? b.position;
					a.position = this.interpolate(prevA, a.position, impact.time);
					b.position = this.interpolate(prevB, b.position, impact.time);
				}
				const remainingTime = (1 - impact.time) * this.tuning.dt;

				const normal = impact.normal;
				const tangent = { x: -normal.y, y: normal.x };
				const dist = distance(a.position, b.position);
				const overlap = Math.max(0, minDist - dist);
				if (overlap > 0) {
					a.position = {
						x: a.position.x - normal.x * overlap * 0.5,
						y: a.position.y - normal.y * overlap * 0.5,
					};
					b.position = {
						x: b.position.x + normal.x * overlap * 0.5,
						y: b.position.y + normal.y * overlap * 0.5,
					};
				}

				const relVel = sub(b.velocity, a.velocity);
				const normalSpeed = dot(relVel, normal);
				if (normalSpeed > 0) continue;

				// 같은 질량의 공끼리 충돌한다고 보고 충돌선 방향으로 impulse를 적용
				// 접선 방향 속도는 아래의 수구 스핀 보정이 있을 때만 변경
				const impulse = -((1 + this.tuning.ballRestitution) * normalSpeed) / 2;
				a.velocity = {
					x: a.velocity.x - impulse * normal.x,
					y: a.velocity.y - impulse * normal.y,
				};
				b.velocity = {
					x: b.velocity.x + impulse * normal.x,
					y: b.velocity.y + impulse * normal.y,
				};

				this.applyCueSpinAfterBallCollision(a, b, normal, tangent, shotDir);
				this.applyCueSpinAfterBallCollision(
					b,
					a,
					scale(normal, -1),
					scale(tangent, -1),
					shotDir,
				);

				this.recordBallCollisionEvent(a, b, step, events, seenContacts);
				if (remainingTime > 1e-6) {
					this.advanceBall(a, remainingTime, step, events, seenContacts);
					this.advanceBall(b, remainingTime, step, events, seenContacts);
				}
			}
		}
	}

	private findBallImpact(
		a: BallState,
		b: BallState,
		prevA: Vec2,
		prevB: Vec2,
		minDist: number,
	): { time: number; normal: Vec2 } | null {
		// |(prevB-prevA) + t*((moveB-moveA))| = 2R 식을 t 범위 [0, 1]에서 품
		// 한 프레임 사이에 빠른 수구가 목적구를 지나쳐버리는 상황을 잡기 위한 계산
		const currentDelta = sub(b.position, a.position);
		const currentDist = length(currentDelta);
		if (currentDist > 1e-8 && currentDist <= minDist) {
			return { time: 1, normal: scale(currentDelta, 1 / currentDist) };
		}

		const prevDelta = sub(prevB, prevA);
		const moveA = sub(a.position, prevA);
		const moveB = sub(b.position, prevB);
		const relativeMove = sub(moveB, moveA);
		const aCoeff = dot(relativeMove, relativeMove);
		if (aCoeff < 1e-12) return null;

		const bCoeff = 2 * dot(prevDelta, relativeMove);
		if (bCoeff >= 0) return null;

		const cCoeff = dot(prevDelta, prevDelta) - minDist * minDist;
		if (cCoeff <= 0) {
			const normal = normalize(prevDelta);
			return { time: 0, normal };
		}

		const discriminant = bCoeff * bCoeff - 4 * aCoeff * cCoeff;
		if (discriminant < 0) return null;

		const time = (-bCoeff - Math.sqrt(discriminant)) / (2 * aCoeff);
		if (time < 0 || time > 1) return null;

		const impactDelta = {
			x: prevDelta.x + relativeMove.x * time,
			y: prevDelta.y + relativeMove.y * time,
		};
		return { time, normal: normalize(impactDelta) };
	}

	private interpolate(from: Vec2, to: Vec2, time: number): Vec2 {
		return {
			x: from.x + (to.x - from.x) * time,
			y: from.y + (to.y - from.y) * time,
		};
	}

	private applyCueSpinAfterBallCollision(
		candidateCue: BallState,
		other: BallState,
		normalFromCueToOther: Vec2,
		tangent: Vec2,
		shotDir: Vec2,
	): void {
		if (candidateCue.id !== "cue") return;

		// 충돌 후 스핀 보정은 수구의 스핀에만 적용
		// 목적구가 임의의 접선 운동을 다시 수구에 주지 않도록 제한
		if (Math.abs(candidateCue.sideSpin) > this.tuning.spinStopSpeed) {
			const tangentCorrection =
				candidateCue.sideSpin * this.tuning.ballSpinTransfer;
			candidateCue.velocity = {
				x: candidateCue.velocity.x + tangent.x * tangentCorrection,
				y: candidateCue.velocity.y + tangent.y * tangentCorrection,
			};
			other.velocity = {
				x: other.velocity.x - tangent.x * tangentCorrection * 0.35,
				y: other.velocity.y - tangent.y * tangentCorrection * 0.35,
			};
		}

		if (Math.abs(candidateCue.topSpin) <= this.tuning.spinStopSpeed) return;

		// 상/하 스핀은 가벼운 근사 모델
		// 상단 스핀은 수구를 충돌선 방향으로 더 밀고, 하단 스핀은 끌어오는 효과를 줌
		// 실제 테이블 데이터가 생기면 이 값을 보정 가능
		const alongShot = dot(normalFromCueToOther, shotDir) >= 0 ? 1 : -1;
		const correction =
			candidateCue.topSpin * this.tuning.followDrawTransfer * alongShot;
		candidateCue.velocity = {
			x: candidateCue.velocity.x + normalFromCueToOther.x * correction,
			y: candidateCue.velocity.y + normalFromCueToOther.y * correction,
		};
		other.velocity = {
			x: other.velocity.x - normalFromCueToOther.x * correction * 0.35,
			y: other.velocity.y - normalFromCueToOther.y * correction * 0.35,
		};
	}

	private isWorldMoving(): boolean {
		for (const ball of this.balls.values()) {
			if (length(ball.velocity) > this.tuning.stopSpeed) return true;
			if (Math.abs(ball.sideSpin) > this.tuning.spinStopSpeed) return true;
			if (Math.abs(ball.topSpin) > this.tuning.spinStopSpeed) return true;
		}
		return false;
	}

	private recordCushionEvent(
		ball: BallState,
		side: CushionSide,
		step: number,
		events: PhysicsEvent[],
		seenContacts: Set<string>,
	): void {
		const key = `cushion:${ball.id}:${side}`;
		if (seenContacts.has(key)) return;
		seenContacts.add(key);
		events.push({
			type: "cushion-hit",
			step,
			position: this.toNormalized(ball.position),
			ballId: ball.id,
			cushionSide: side,
		});
	}

	private recordBallCollisionEvent(
		a: BallState,
		b: BallState,
		step: number,
		events: PhysicsEvent[],
		seenContacts: Set<string>,
	): void {
		const key = `ball:${[a.id, b.id].sort().join(":")}`;
		if (seenContacts.has(key)) return;
		seenContacts.add(key);
		const position = this.toNormalized({
			x: (a.position.x + b.position.x) / 2,
			y: (a.position.y + b.position.y) / 2,
		});
		events.push({
			type: "ball-collision",
			step,
			position,
			ballId: a.id,
			otherBallId: b.id,
		});
		events.push({
			type: "ball-collision",
			step,
			position,
			ballId: b.id,
			otherBallId: a.id,
		});
	}

	private hasRecentEvent(
		events: PhysicsEvent[],
		step: number,
		ballId: string,
	): boolean {
		return events.some((event) => event.step === step && event.ballId === ballId);
	}

	private saveState(): SavedState {
		return {
			balls: new Map(
				[...this.balls.entries()].map(([id, ball]) => [
					id,
					{
						id: ball.id,
						position: { ...ball.position },
						velocity: { ...ball.velocity },
						sideSpin: ball.sideSpin,
						topSpin: ball.topSpin,
					},
				]),
			),
		};
	}

	private restoreState(state: SavedState): void {
		this.balls = new Map(
			[...state.balls.entries()].map(([id, ball]) => [
				id,
				{
					id: ball.id,
					position: { ...ball.position },
					velocity: { ...ball.velocity },
					sideSpin: ball.sideSpin,
					topSpin: ball.topSpin,
				},
			]),
		);
	}

	private emptyResult(): PhysicsResult {
		return {
			trajectories: [],
			events: [],
			summary: {
				stepCount: 0,
				stopped: true,
				travelDistanceByBall: {},
			},
		};
	}

	private toMeter(point: Point): Vec2 {
		return {
			x: (point.x / NORMALIZED_SIZE) * TABLE_WIDTH_M,
			y: (point.y / NORMALIZED_SIZE) * TABLE_HEIGHT_M,
		};
	}

	private toNormalized(position: Vec2): Point {
		return {
			x: (position.x / TABLE_WIDTH_M) * NORMALIZED_SIZE,
			y: (position.y / TABLE_HEIGHT_M) * NORMALIZED_SIZE,
		};
	}

	private clampToTable(position: Vec2): Vec2 {
		return {
			x: clamp(position.x, POSITION_MARGIN_M, TABLE_WIDTH_M - POSITION_MARGIN_M),
			y: clamp(position.y, POSITION_MARGIN_M, TABLE_HEIGHT_M - POSITION_MARGIN_M),
		};
	}

	private decayTowardZero(value: number, amount: number): number {
		if (value > 0) return Math.max(0, value - amount);
		if (value < 0) return Math.min(0, value + amount);
		return 0;
	}

	private normalizeTipOffset(offsetMm: number): number {
		// UI의 +/-60mm 입력을 최대 스핀으로 보고, 외부 감지 노이즈는 -1~1로 제한
		if (!Number.isFinite(offsetMm)) return 0;
		if (this.tuning.spinInputReferenceMm <= 0) return 0;

		const ratio = offsetMm / this.tuning.spinInputReferenceMm;
		return clamp(ratio, -this.tuning.maxSpinRatio, this.tuning.maxSpinRatio);
	}
}
