import type { DetectedState } from "@/types/detection";
import type { Point, PredictShotInput } from "@/types/physics";

const HIT_POINT_TO_SPIN_MM = 100;
const MIN_POWER = 0;
const MAX_POWER = 3;
const MIN_HIT_POINT = -1;
const MAX_HIT_POINT = 1;
const DEFAULT_MAX_STEPS = 2400;

function clamp(
	value: number,
	min: number,
	max: number,
	fallback = min,
): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, value));
}

function normalizeAngleDeg(angleDeg: number): number {
	if (!Number.isFinite(angleDeg)) return 0;
	return ((angleDeg % 360) + 360) % 360;
}

function normalizeMaxSteps(maxSteps: number): number {
	if (!Number.isFinite(maxSteps) || maxSteps <= 0) return DEFAULT_MAX_STEPS;
	return Math.max(1, Math.floor(maxSteps));
}

export function detectedStateToPredictShotInput(
	detected: DetectedState,
	maxSteps = DEFAULT_MAX_STEPS,
): PredictShotInput {
	const balls: Record<string, Point> = {};

	for (const ball of detected.balls) {
		if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y)) continue;

		const ballId = ball.id === detected.shot.cueBallId ? "cue" : ball.id;
		balls[ballId] = { x: ball.x, y: ball.y };
	}

	return {
		balls,
		angle: normalizeAngleDeg(detected.cue.angleDeg),
		power: clamp(detected.cue.power, MIN_POWER, MAX_POWER, 0),
		sideSpin:
			clamp(detected.cue.hitPoint.x, MIN_HIT_POINT, MAX_HIT_POINT, 0) *
			HIT_POINT_TO_SPIN_MM,
		topSpin:
			clamp(detected.cue.hitPoint.y, MIN_HIT_POINT, MAX_HIT_POINT, 0) *
			HIT_POINT_TO_SPIN_MM,
		maxSteps: normalizeMaxSteps(maxSteps),
	};
}
