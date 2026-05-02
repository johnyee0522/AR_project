import { useEffect, useRef, useState } from "react";
import useSimulation from "@/hooks/use_simulation";
import { TABLE_HEIGHT_M, TABLE_WIDTH_M } from "@/lib/physics/physics_constants";
import type { BallTrajectory } from "@/types/physics";

export default function PhysicsTestView() {
	const { sim } = useSimulation();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [cueX, setCueX] = useState(0.57);
	const [cueY, setCueY] = useState(1.07);
	const [angle, setAngle] = useState(45);
	const power = 1.5;

	const CANVAS_WIDTH = 800;
	const CANVAS_HEIGHT = 400;

	useEffect(() => {
		if (!canvasRef.current) return;
		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		sim.updateBallPositionsMeters({
			cue: { x: cueX, y: cueY },
			red: { x: 1.42, y: 0.71 },
		});

		const physicsResult = sim.predict(angle, power);
		const cueTrajectory =
			physicsResult.trajectories.find((t: BallTrajectory) => t.ballId === "cue")
				?.waypoints || [];

		ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.fillStyle = "#2a6a42";
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		const toCanvas = (x: number, y: number) => ({
			x: (x / TABLE_WIDTH_M) * CANVAS_WIDTH,
			y: (y / TABLE_HEIGHT_M) * CANVAS_HEIGHT,
		});

		const targetPos = toCanvas(1.42, 0.71);
		ctx.beginPath();
		ctx.arc(targetPos.x, targetPos.y, 10, 0, Math.PI * 2);
		ctx.fillStyle = "#ff4444";
		ctx.fill();
		ctx.closePath();

		const cuePos = toCanvas(cueX, cueY);
		ctx.beginPath();
		ctx.arc(cuePos.x, cuePos.y, 10, 0, Math.PI * 2);
		ctx.fillStyle = "#ffffff";
		ctx.fill();
		ctx.closePath();

		if (cueTrajectory.length > 0) {
			const start = toCanvas(cueTrajectory[0].x, cueTrajectory[0].y);
			ctx.beginPath();
			ctx.moveTo(start.x, start.y);
			for (let i = 1; i < cueTrajectory.length; i++) {
				const pt = toCanvas(cueTrajectory[i].x, cueTrajectory[i].y);
				ctx.lineTo(pt.x, pt.y);
			}
			ctx.strokeStyle = "white";
			ctx.setLineDash([5, 5]);
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.setLineDash([]);
		}
	}, [sim, cueX, cueY, angle]);

	return (
		<div
			style={{
				padding: "20px",
				background: "#1e1e1e",
				color: "white",
				fontFamily: "sans-serif",
			}}
		>
			<h2 style={{ marginBottom: "20px" }}>물리엔진 예측 테스트</h2>
			<div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
				<label style={{ display: "flex", flexDirection: "column", width: "200px" }}>
					수구 X: {cueX.toFixed(2)}m
					<input
						type="range"
						min="0"
						max={TABLE_WIDTH_M}
						step="0.01"
						value={cueX}
						onChange={(e) => setCueX(Number(e.target.value))}
					/>
				</label>
				<label style={{ display: "flex", flexDirection: "column", width: "200px" }}>
					수구 Y: {cueY.toFixed(2)}m
					<input
						type="range"
						min="0"
						max={TABLE_HEIGHT_M}
						step="0.01"
						value={cueY}
						onChange={(e) => setCueY(Number(e.target.value))}
					/>
				</label>
				<label style={{ display: "flex", flexDirection: "column", width: "200px" }}>
					타격 각도: {angle}도
					<input
						type="range"
						min="0"
						max="360"
						value={angle}
						onChange={(e) => setAngle(Number(e.target.value))}
					/>
				</label>
			</div>
			<canvas
				ref={canvasRef}
				width={CANVAS_WIDTH}
				height={CANVAS_HEIGHT}
				style={{ border: "4px solid #444", borderRadius: "8px" }}
			/>
		</div>
	);
}
