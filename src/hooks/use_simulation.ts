import { useEffect, useState } from "react";
import { Simulation2D } from "@/lib/physics";

export default function useSimulation() {
	const [sim] = useState(() => new Simulation2D());

	useEffect(() => {
		return () => {
			sim.destroy();
		};
	}, [sim]);

	return { sim };
}
