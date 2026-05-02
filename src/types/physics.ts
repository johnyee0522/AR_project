// 앱 전체에서 쓰는 당구대 meter 좌표입니다.
// x는 0~TABLE_WIDTH_M, y는 0~TABLE_HEIGHT_M 범위를 사용합니다.
export interface Point {
	x: number;
	y: number;
}

export type MeterPoint = Point;

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
}

export interface PhysicsResult {
	trajectories: BallTrajectory[];
	events?: PhysicsEvent[];
	summary?: PhysicsSummary;
}
