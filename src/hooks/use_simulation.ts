// 위치: src/hooks/use_simulation.ts

import { useEffect, useState } from 'react';
import { Simulation } from '@/lib/physics/simulation';

export default function useSimulation() {
    const [sim, setSim] = useState<Simulation | null>(null);

    useEffect(() => {
        let simulationInstance: Simulation | null = null;

        // 동적 임포트로 Rapier 모듈을 로드한 뒤 클래스에 주입
        import('@dimforge/rapier2d').then((RAPIER) => {
            simulationInstance = new Simulation(RAPIER);
            setSim(simulationInstance);
        });

        return () => {
            if (simulationInstance) {
                simulationInstance.destroy();
            }
        };
    }, []);

    return { sim };
}