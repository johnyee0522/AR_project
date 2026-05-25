import { useMemo } from "react";
import { SIMULATION_2D_TUNING_VERSION, Simulation2D } from "@/lib/physics";
import {
	RAPIER_SIMULATION_TUNING_VERSION,
	RapierPhysicsSimulator,
} from "@/lib/physics/rapier_simulator";
import type { PhysicsResult, Point } from "@/types/physics";

export type PhysicsEngineMode = "custom" | "rapier";

interface PhysicsSimulator {
	updateBallPositionsMeters(ballPositions: Record<string, Point>): void;
	predict(
		angleDeg: number,
		power: number,
		maxSteps?: number,
		offsetSide?: number,
		offsetTop?: number,
	): PhysicsResult;
}

export default function useSimulation(engineMode: PhysicsEngineMode) {
	const customSim = useMemo(() => new Simulation2D(), []);
	const rapierSim = useMemo(() => new RapierPhysicsSimulator(), []);
	const sim: PhysicsSimulator =
		engineMode === "rapier" ? rapierSim : customSim;

	return {
		sim,
		tuningVersion:
			engineMode === "rapier"
				? RAPIER_SIMULATION_TUNING_VERSION
				: SIMULATION_2D_TUNING_VERSION,
	};
}
