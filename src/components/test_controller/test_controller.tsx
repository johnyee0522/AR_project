import { useEffect, useRef, useState } from 'react';
import useSimulation from '@/hooks/use_simulation';

export default function TestController() {
    const { sim } = useSimulation();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [cueX, setCueX] = useState<number>(200);
    const [cueY, setCueY] = useState<number>(200);
    const [angle, setAngle] = useState<number>(45);
    const power = 0.5; 

    const CANVAS_WIDTH = 800;
    const CANVAS_HEIGHT = 400;

    useEffect(() => {
        if (!sim || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        sim.clear();
        sim.createTable(CANVAS_WIDTH, CANVAS_HEIGHT);

        const cueBall = sim.createBall(cueX, cueY);
        const targetBall = sim.createBall(600, 200);

        const allBalls = [cueBall, targetBall];
        const trajectory = sim.predictTrajectory(cueBall, allBalls, angle, power);

        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#2a6a42';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.beginPath(); ctx.arc(600, 200, 10, 0, Math.PI * 2); ctx.fillStyle = '#ff4444'; ctx.fill(); ctx.closePath();
        ctx.beginPath(); ctx.arc(cueX, cueY, 10, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.closePath();

        if (trajectory.length > 0) {
            ctx.beginPath(); ctx.moveTo(trajectory[0].x, trajectory[0].y);
            for (let i = 1; i < trajectory.length; i++) ctx.lineTo(trajectory[i].x, trajectory[i].y);
            ctx.strokeStyle = 'white'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); 
        }
    }, [sim, cueX, cueY, angle]);

    if (!sim) return <div style={{ color: 'white', padding: '20px' }}>물리 엔진 로딩 중...</div>;

    return (
        <div style={{ padding: '20px', background: '#1e1e1e', color: 'white', fontFamily: 'sans-serif' }}>
            <h2 style={{ marginBottom: '20px' }}>물리 엔진 예측 테스트</h2>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', width: '200px' }}>
                    수구 X 위치: {cueX}px
                    <input type="range" min="20" max={CANVAS_WIDTH - 20} value={cueX} onChange={(e) => setCueX(Number(e.target.value))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', width: '200px' }}>
                    수구 Y 위치: {cueY}px
                    <input type="range" min="20" max={CANVAS_HEIGHT - 20} value={cueY} onChange={(e) => setCueY(Number(e.target.value))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', width: '200px' }}>
                    타격 각도: {angle}°
                    <input type="range" min="0" max="360" value={angle} onChange={(e) => setAngle(Number(e.target.value))} />
                </label>
            </div>
            <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: '4px solid #444', borderRadius: '8px' }} />
        </div>
    );
}