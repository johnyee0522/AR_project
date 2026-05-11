export interface DetectedBall {
	id: string;
	x: number;
	y: number;
}

export interface DetectedHitPoint {
	x: number;
	y: number;
}

export interface DetectedCue {
	angleDeg: number;
	power: number;
	hitPoint: DetectedHitPoint;
}

export interface DetectedShot {
	cueBallId: string;
}

export interface DetectedState {
	cue: DetectedCue;
	shot: DetectedShot;
	balls: DetectedBall[];
}
