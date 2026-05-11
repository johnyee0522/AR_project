// 프로젝트 전체에서 쓰는 당구대 좌표는 meter 단위입니다.
// 원점은 당구대 왼쪽 위, x는 오른쪽, y는 아래쪽으로 증가합니다.
export interface Point {
	x: number;
	y: number;
}

export type MeterPoint = Point;

export interface BallPositions {
	[ballId: string]: MeterPoint;
}

export interface RequiredBallPositions extends BallPositions {
	cue: MeterPoint;
	red: MeterPoint;
	yellow: MeterPoint;
}

export type {
	DetectedBall,
	DetectedCue,
	DetectedHitPoint,
	DetectedShot,
	DetectedState,
} from "./detection";

export interface BallTrajectory {
	ballId: string;
	waypoints: Point[];
}

export type PhysicsEventType = "ball-collision" | "cushion-hit";

export type CushionSide = "top" | "bottom" | "left" | "right";

export interface PhysicsEvent {
	type: PhysicsEventType;
	step: number;
	position: Point;
	ballId: string;
	otherBallId?: string;
	cushionSide?: CushionSide;
}

export interface PhysicsSummary {
	stepCount: number;
	stopped: boolean;
	firstHitBallId?: string;
	firstCushionSide?: CushionSide;
	travelDistanceByBall: Record<string, number>;
	trajectoryDistanceByBall?: Record<string, number>;
	finalPositions: Record<string, Point>;
}

export interface PhysicsResult {
	trajectories: BallTrajectory[];
	events: PhysicsEvent[];
	summary: PhysicsSummary;
}

export interface PredictShotInput {
	balls: BallPositions;
	angle: number;
	power: number;
	maxSteps?: number;
	sideSpin?: number;
	topSpin?: number;
}
