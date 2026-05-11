import type { PhysicsResult, PredictShotInput } from "@/types/physics";

import { Simulation2D, type Simulation2DTuning } from "./simulation_2d";

export {
	DEFAULT_SIMULATION_2D_TUNING,
	SIMULATION_2D_TUNING_VERSION,
} from "./simulation_2d";
export { Simulation2D, type Simulation2DTuning };
export { detectedStateToPredictShotInput } from "./detection_adapter";
export type { PredictShotInput } from "@/types/physics";
export {
	POWER_LEVELS,
	calculateRollingFrictionForTravel,
	calibratePowerTravel,
	estimatePowerTravel,
	estimatePowerValueTravel,
	getPowerTravelEstimates,
	type PowerCalibrationInput,
	type PowerCalibrationResult,
	type PowerLevel,
	type PowerTravelEstimate,
	type PowerValueTravelEstimate,
} from "./power_calibration";

export function predictShot(
	input: PredictShotInput,
	tuning: Partial<Simulation2DTuning> = {},
): PhysicsResult {
	const simulation = new Simulation2D(tuning);
	simulation.updateBallPositionsMeters(input.balls);
	return simulation.predict(
		input.angle,
		input.power,
		input.maxSteps,
		input.sideSpin ?? 0,
		input.topSpin ?? 0,
	);
}

export function predictFinalPositions(
	input: PredictShotInput,
	tuning: Partial<Simulation2DTuning> = {},
): PhysicsResult["summary"]["finalPositions"] {
	return predictShot(input, tuning).summary.finalPositions;
}
