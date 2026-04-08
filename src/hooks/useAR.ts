import { useState, useRef, useEffect, useCallback } from "react";
import type { RefObject } from "react";
import type { PhysicsResult } from "@/types/physics";
import logger from "@/lib/logger";

interface UseAROptions {
	arCanvasRef: RefObject<HTMLCanvasElement | null>;
	minimapCanvasRef: RefObject<HTMLCanvasElement | null>;
	containerRef: RefObject<HTMLDivElement | null>;
}

interface UseARReturn {
	isARMode: boolean;
	toggleARMode: () => void;
	drawAR: (result: PhysicsResult | null) => void;
}

// 공 ID별 궤적선 색상
const BALL_COLORS: Record<string, string> = {
	cue: "#ffffff",    // 수구 — 흰색
	red: "#ff4757",    // 적구 — 빨간색
	yellow: "#ffd700", // 황구 — 노란색
};
const FALLBACK_COLOR = "#00e5ff";

function getBallColor(ballId: string): string {
	return BALL_COLORS[ballId] ?? FALLBACK_COLOR;
}

/**
 * AR 오버레이(궤적선, 미니맵)를 그리는 훅.
 *
 * drawAR()에 PhysicsResult를 넘기면 수구의 예측 궤적을 화면에 그려줍니다.
 * 물리엔진 연동 전까지는 useCamera.ts의 테스트용 고정 좌표로 동작합니다.
 *
 * 좌표 기준:
 *   - PhysicsResult의 waypoints는 0~1000 범위의 탑뷰 좌표
 *   - 실제 화면에 그릴 때 canvas 크기에 맞게 비율로 변환
 */
function useAR({
	arCanvasRef,
	minimapCanvasRef,
	containerRef,
}: UseAROptions): UseARReturn {
	const [isARMode, setIsARMode] = useState(false);
	const isARModeRef = useRef(false);

	// 캔버스 크기를 컨테이너에 맞게 조정 (화면 회전, 리사이즈 대응)
	useEffect(() => {
		const handleResize = () => {
			const canvas = arCanvasRef.current;
			if (canvas && containerRef.current) {
				canvas.width = containerRef.current.clientWidth;
				canvas.height = containerRef.current.clientHeight;
			}
		};
		handleResize();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [arCanvasRef, containerRef]);

	const toggleARMode = useCallback(() => {
		setIsARMode((prev) => {
			const next = !prev;
			isARModeRef.current = next;
			logger.info(next ? "AR 모드 시작" : "AR 모드 종료");
			return next;
		});
	}, []);

	const drawAR = useCallback(
		(result: PhysicsResult | null) => {
			const canvas = arCanvasRef.current;
			const minimapCanvas = minimapCanvasRef.current;
			if (!canvas || !minimapCanvas) return;

			const ctx = canvas.getContext("2d");
			const mCtx = minimapCanvas.getContext("2d");
			if (!ctx || !mCtx) return;

			// AR 꺼져있거나 결과 없으면 캔버스 지우기
			if (!isARModeRef.current || !result) {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
				return;
			}

			ctx.clearRect(0, 0, canvas.width, canvas.height);
			mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

			const scaleX = minimapCanvas.width / canvas.width;
			const scaleY = minimapCanvas.height / canvas.height;

			// 각 공의 궤적 그리기
			for (const trajectory of result.trajectories) {
				if (trajectory.waypoints.length < 2) continue;

				const color = getBallColor(trajectory.ballId);

				// waypoints(0~1000 기준)를 실제 canvas 크기로 변환
				const scaled = trajectory.waypoints.map((p) => ({
					x: (p.x / 1000) * canvas.width,
					y: (p.y / 1000) * canvas.height,
				}));
				const start = scaled[0];

				// 메인 캔버스: 점선 궤적
				ctx.save();
				ctx.strokeStyle = color;
				ctx.lineWidth = 2;
				ctx.setLineDash([6, 6]);
				ctx.shadowBlur = 10;
				ctx.shadowColor = color;
				ctx.beginPath();
				ctx.moveTo(start.x, start.y);
				for (const point of scaled.slice(1)) {
					ctx.lineTo(point.x, point.y);
				}
				ctx.stroke();
				ctx.restore();

				// 메인 캔버스: 수구 위치 원
				ctx.save();
				ctx.beginPath();
				ctx.arc(start.x, start.y, 12, 0, 2 * Math.PI);
				ctx.fillStyle = color;
				ctx.shadowBlur = 10;
				ctx.shadowColor = color;
				ctx.globalAlpha = 0.9;
				ctx.fill();
				ctx.restore();

				// 미니맵: 점선 궤적
				mCtx.save();
				mCtx.strokeStyle = color;
				mCtx.lineWidth = 1;
				mCtx.beginPath();
				mCtx.moveTo(start.x * scaleX, start.y * scaleY);
				for (const point of scaled.slice(1)) {
					mCtx.lineTo(point.x * scaleX, point.y * scaleY);
				}
				mCtx.stroke();

				// 미니맵: 수구 위치 점
				mCtx.beginPath();
				mCtx.arc(start.x * scaleX, start.y * scaleY, 3, 0, 2 * Math.PI);
				mCtx.fillStyle = color;
				mCtx.fill();
				mCtx.restore();
			}
		},
		[arCanvasRef, minimapCanvasRef],
	);

	return { isARMode, toggleARMode, drawAR };
}

export default useAR;