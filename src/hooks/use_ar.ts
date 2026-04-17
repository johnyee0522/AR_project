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

const BALL_COLORS: Record<string, string> = {
	cue: "#ffffff",
	red: "#ff4757",
	yellow: "#ffd700",
};
const FALLBACK_COLOR = "#00e5ff";

function getBallColor(ballId: string): string {
	return BALL_COLORS[ballId] ?? FALLBACK_COLOR;
}

/**
 * AR 오버레이(궤적선 및 미니맵) 렌더링을 담당하는 훅
 */
function useAR({
	arCanvasRef,
	minimapCanvasRef,
	containerRef,
}: UseAROptions): UseARReturn {
	const [isARMode, setIsARMode] = useState(false);
	const isARModeRef = useRef(false);

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

	/** AR 시각화 모드 토글 */
	const toggleARMode = useCallback(() => {
		setIsARMode((prev) => {
			const next = !prev;
			isARModeRef.current = next;
			logger.info(next ? "AR 모드 시작" : "AR 모드 종료");
			return next;
		});
	}, []);

	/**
	 * 물리 엔진 결과를 바탕으로 AR 궤적 및 미니맵 포인트 렌더링
	 */
	const drawAR = useCallback(
		(result: PhysicsResult | null) => {
			const canvas = arCanvasRef.current;
			const minimapCanvas = minimapCanvasRef.current;
			if (!canvas || !minimapCanvas) return;

			const ctx = canvas.getContext("2d");
			const mCtx = minimapCanvas.getContext("2d");
			if (!ctx || !mCtx) return;

			ctx.clearRect(0, 0, canvas.width, canvas.height);
			mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

			if (!isARModeRef.current || !result) return;

			const scaleX = minimapCanvas.width / canvas.width;
			const scaleY = minimapCanvas.height / canvas.height;

			// 물리적 충돌 지점과 일치시키기 위한 시각적 공 반지름 보정
			const ballRadiusPx = (0.03075 / 2.84) * canvas.width * 2.0;
			const minimapBallRadiusPx = (minimapCanvas.width / 70) * 3;

			for (const trajectory of result.trajectories) {
				const color = getBallColor(trajectory.ballId);
				const scaledWaypoints = trajectory.waypoints.map((p) => ({
					x: (p.x / 1000) * canvas.width,
					y: (p.y / 1000) * canvas.height,
				}));

				if (scaledWaypoints.length === 0) continue;

				// 1. 메인 AR 캔버스 그리기 (생략 - 향후 탑뷰 변환 오버레이로 대체 예정)

				// 2. 미니맵 그리기
				const minimapWaypoints = scaledWaypoints.map((p) => ({
					x: p.x * scaleX,
					y: p.y * scaleY,
				}));
				if (minimapWaypoints.length >= 2) {
					// 미니맵 크기에 비례하여 점선 간격 조절 (기본 4, 확대 시 약 6으로 더 촘촘하게)
					const dashSize = (minimapCanvas.width / 70) * 1.33 + 2.67;
					drawTrajectoryLine(mCtx, minimapWaypoints, color, {
						dashed: true,
						dashPattern: [dashSize, dashSize],
						lineWidth: 1,
					});
				}
				drawBallPoint(
					mCtx,
					minimapWaypoints[0],
					color,
					minimapBallRadiusPx,
					false,
				);
			}
		},
		[arCanvasRef, minimapCanvasRef],
	);

	return { isARMode, toggleARMode, drawAR };
}

/* 캔버스 드로잉 유틸리티 */

function drawTrajectoryLine(
	ctx: CanvasRenderingContext2D,
	points: { x: number; y: number }[],
	color: string,
	options: { dashed?: boolean; dashPattern?: number[]; lineWidth: number; glow?: boolean },
) {
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = options.lineWidth;
	if (options.dashed) {
		ctx.setLineDash(options.dashPattern || [6, 6]);
	}
	if (options.glow) {
		ctx.shadowBlur = 10;
		ctx.shadowColor = color;
	}

	ctx.beginPath();
	ctx.moveTo(points[0].x, points[0].y);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i].x, points[i].y);
	}
	ctx.stroke();
	ctx.restore();
}

function drawBallPoint(
	ctx: CanvasRenderingContext2D,
	point: { x: number; y: number },
	color: string,
	radius: number,
	glow: boolean,
) {
	ctx.save();
	ctx.beginPath();
	ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
	ctx.fillStyle = color;
	if (glow) {
		ctx.shadowBlur = 10;
		ctx.shadowColor = color;
		ctx.globalAlpha = 0.9;
	}
	ctx.fill();
	ctx.restore();
}

export default useAR;
