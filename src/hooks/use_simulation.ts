import { useEffect, useState } from "react";
import { Simulation } from "@/lib/physics/simulation";

export default function useSimulation() {
	const [sim, setSim] = useState<Simulation | null>(null);

	useEffect(() => {
		let simulationInstance: Simulation | null = null;

		import("@dimforge/rapier2d").then((RAPIER) => {
			simulationInstance = new Simulation(RAPIER);
			setSim(simulationInstance);
		});

		return () => {
			if (simulationInstance) simulationInstance.destroy();
		};
	}, []);

	return { sim };
}
