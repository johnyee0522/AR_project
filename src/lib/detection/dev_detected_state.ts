import type { DetectedState } from "@/types/detection";
import type { BallPositions } from "@/types/physics";

export interface DevDetectedStateInput {
	balls: BallPositions;
	angle: number;
	power: number;
	sideSpin: number;
	topSpin: number;
	cueBallId?: string;
}

const DEFAULT_CUE_BALL_ID = "cue";
const SPIN_MM_TO_HIT_POINT = 1 / 100;

export function createDevDetectedState({
	balls,
	angle,
	power,
	sideSpin,
	topSpin,
	cueBallId = DEFAULT_CUE_BALL_ID,
}: DevDetectedStateInput): DetectedState {
	return {
		cue: {
			angleDeg: angle,
			power,
			hitPoint: {
				x: sideSpin * SPIN_MM_TO_HIT_POINT,
				y: topSpin * SPIN_MM_TO_HIT_POINT,
			},
		},
		shot: {
			cueBallId,
		},
		balls: Object.entries(balls).map(([id, position]) => ({
			id,
			x: position.x,
			y: position.y,
		})),
	};
}
