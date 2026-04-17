import { useEffect, useRef, useState } from "react";
import use_simulation from "@/hooks/use_simulation";
import type { BallTrajectory } from "@/types/physics";

/**
 * 물리 엔진의 계산 결과를 독립적으로 검증하기 위한 테스트 화면
 */
export default function PhysicsTestView() {
	const { sim } = use_simulation();
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// 0~1000 정규화 좌표계 상태
	const [cueX, setCueX] = useState<number>(200);
	const [cueY, setCueY] = useState<number>(750);
	const [angle, setAngle] = useState<number>(45);
	const power = 1.5;

	const CANVAS_WIDTH = 800;
	const CANVAS_HEIGHT = 400;

	useEffect(() => {
		if (!sim || !canvasRef.current) return;
		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// 1. 공 위치 업데이트 (Simulation 클래스의 현재 API 사용)
		sim.updateBallPositions({
			cue: { x: cueX, y: cueY },
			red: { x: 500, y: 500 },
		});

		// 2. 궤적 예측
		const physicsResult = sim.predict(angle, power);

		// 3. 결과에서 수구(cue)의 궤적 추출 (타입 에러 방지를 위해 BallTrajectory 명시)
		const cueTrajectory =
			physicsResult.trajectories.find((t: BallTrajectory) => t.ballId === "cue")
				?.waypoints || [];

		// 4. 캔버스 렌더링
		ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		ctx.fillStyle = "#2a6a42"; // 당구대 색상
		ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

		const toCanvas = (x: number, y: number) => ({
			x: (x / 1000) * CANVAS_WIDTH,
			y: (y / 1000) * CANVAS_HEIGHT,
		});

		// 적구 그리기
		const targetPos = toCanvas(500, 500);
		ctx.beginPath();
		ctx.arc(targetPos.x, targetPos.y, 10, 0, Math.PI * 2);
		ctx.fillStyle = "#ff4444";
		ctx.fill();
		ctx.closePath();

		// 수구 그리기
		const cuePos = toCanvas(cueX, cueY);
		ctx.beginPath();
		ctx.arc(cuePos.x, cuePos.y, 10, 0, Math.PI * 2);
		ctx.fillStyle = "#ffffff";
		ctx.fill();
		ctx.closePath();

		// 예측 궤적 점선 그리기
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

	if (!sim)
		return (
			<div style={{ color: "white", padding: "20px" }}>
				물리 엔진 로딩 중...
			</div>
		);

	return (
		<div
			style={{
				padding: "20px",
				background: "#1e1e1e",
				color: "white",
				fontFamily: "sans-serif",
			}}
		>
			<h2 style={{ marginBottom: "20px" }}>
				물리 엔진 예측 테스트 (PhysicsTestView)
			</h2>
			<div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
				<label
					style={{ display: "flex", flexDirection: "column", width: "200px" }}
				>
					수구 X (0~1000): {cueX}
					<input
						type="range"
						min="0"
						max="1000"
						value={cueX}
						onChange={(e) => setCueX(Number(e.target.value))}
					/>
				</label>
				<label
					style={{ display: "flex", flexDirection: "column", width: "200px" }}
				>
					수구 Y (0~1000): {cueY}
					<input
						type="range"
						min="0"
						max="1000"
						value={cueY}
						onChange={(e) => setCueY(Number(e.target.value))}
					/>
				</label>
				<label
					style={{ display: "flex", flexDirection: "column", width: "200px" }}
				>
					타격 각도: {angle}°
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
