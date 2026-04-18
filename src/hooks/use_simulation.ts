import { useEffect, useState } from "react";
import { Simulation3D } from "@/lib/physics/simulation_3d";

export default function useSimulation() {
	const [sim, setSim] = useState<Simulation3D | null>(null);

	useEffect(() => {
		let simulationInstance: Simulation3D | null = null;

		import("@dimforge/rapier3d").then((RAPIER) => {
			// vite-plugin-wasm이 이미 초기화를 처리했거나, 
			// 별도의 init()이 필요 없는 버전일 수 있으므로 바로 생성 시도
			simulationInstance = new Simulation3D(RAPIER);
			setSim(simulationInstance);
		});

		return () => {
			if (simulationInstance) simulationInstance.destroy();
		};
	}, []);

	return { sim };
}
