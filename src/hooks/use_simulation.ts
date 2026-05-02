import { SIMULATION_2D_TUNING_VERSION, Simulation2D } from "@/lib/physics";

export default function useSimulation() {
	return {
		sim: new Simulation2D(),
		tuningVersion: SIMULATION_2D_TUNING_VERSION,
	};
}
