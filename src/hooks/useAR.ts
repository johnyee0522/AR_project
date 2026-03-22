import { useState, useRef, useEffect, useCallback, RefObject } from "react";
import type { BallPos } from "./useCamera";

interface UseAROptions {
    arCanvasRef: RefObject<HTMLCanvasElement | null>;
    minimapCanvasRef: RefObject<HTMLCanvasElement | null>;
    containerRef: RefObject<HTMLDivElement | null>;
}

interface UseARReturn {
    isARMode: boolean;
    toggleARMode: () => void;
    handlePointerEvent: (e: React.PointerEvent<HTMLDivElement>) => void;
    drawAR: (ballPos: BallPos | null) => void;
}

/**
 * AR 오버레이(궤적선, 미니맵)를 그리고,
 * 터치/마우스 이벤트로 수구(내 공) 위치를 설정하는 훅.
 */
function useAR({ arCanvasRef, minimapCanvasRef, containerRef }: UseAROptions): UseARReturn {
    const [isARMode, setIsARMode] = useState(false);
    const isARModeRef = useRef(false);

    // 사용자가 화면을 터치한 좌표 (수구 위치)
    const touchPosRef = useRef<{ x: number; y: number } | null>(null);

    // 캔버스 크기를 컨테이너에 맞게 조정
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
            // AR 켤 때 터치 기록 초기화 (화면 중앙부터 다시 시작)
            if (next) touchPosRef.current = null;
            return next;
        });
    }, []);

    // 배경(캔버스, div)을 터치했을 때만 수구 위치 업데이트
    const handlePointerEvent = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (target.tagName !== "CANVAS" && target.tagName !== "DIV") return;
        touchPosRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    // 공 감지 결과를 받아서 AR 오버레이를 그림
    const drawAR = useCallback(
        (ballPos: BallPos | null) => {
            const canvas = arCanvasRef.current;
            const minimapCanvas = minimapCanvasRef.current;
            if (!canvas || !minimapCanvas) return;

            const ctx = canvas.getContext("2d");
            const mCtx = minimapCanvas.getContext("2d");
            if (!ctx || !mCtx) return;

            // AR 꺼져있거나 공 없으면 캔버스 지우기
            if (!isARModeRef.current || !ballPos) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
                return;
            }

            const { width, height } = canvas;

            // 수구 위치: 터치한 곳이 있으면 그곳, 없으면 화면 중앙 하단
            const startX = touchPosRef.current?.x ?? width / 2;
            const startY = touchPosRef.current?.y ?? height - 150;

            // 캔버스 초기화
            ctx.clearRect(0, 0, width, height);
            mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

            // 메인 캔버스: 수구 → 목적구 궤적선
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#00e5ff";
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(ballPos.x, ballPos.y);
            ctx.stroke();

            // 수구 위치 표시 원
            ctx.shadowColor = "white";
            ctx.beginPath();
            ctx.arc(startX, startY, 12, 0, 2 * Math.PI);
            ctx.fillStyle = "white";
            ctx.fill();

            // 미니맵
            const scaleX = minimapCanvas.width / width;
            const scaleY = minimapCanvas.height / height;

            mCtx.strokeStyle = "#00e5ff";
            mCtx.lineWidth = 1;
            mCtx.beginPath();
            mCtx.moveTo(startX * scaleX, startY * scaleY);
            mCtx.lineTo(ballPos.x * scaleX, ballPos.y * scaleY);
            mCtx.stroke();

            mCtx.beginPath();
            mCtx.arc(startX * scaleX, startY * scaleY, 3, 0, 2 * Math.PI);
            mCtx.fillStyle = "white";
            mCtx.fill();
        },
        [arCanvasRef, minimapCanvasRef],
    );

    return { isARMode, toggleARMode, handlePointerEvent, drawAR };
}

export default useAR;
