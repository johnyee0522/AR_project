import React, { useCallback, useEffect, useRef, useState } from "react";
import createFrameCapture from "@/lib/capture";
import Cuebit from "@/lib/cuebit";
import { todo } from "@/common";

function Main() {
    // 1️⃣ 도화지(Canvas)가 3개로 늘어났습니다!
    const videoCanvasRef = useRef<HTMLCanvasElement>(null); // 팀원의 OpenCV 영상 출력용 (기존 비디오 태그 대체)
    const arCanvasRef = useRef<HTMLCanvasElement>(null);    // 종준님의 AR 네온 궤적 그리기용
    const minimapCanvasRef = useRef<HTMLCanvasElement>(null); // 미니맵용
    const containerRef = useRef<HTMLDivElement>(null);

    const [mode, setMode] = useState<string>('4구');
    const [isARMode, setIsARMode] = useState<boolean>(false);

    /**
     * 🛠 팀원분이 작성하신 캔버스 렌더링 유틸
     */
    const createFrameDrawer = useCallback(
        (canvas: HTMLCanvasElement, width: number, height: number) => {
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");

            if (!context) {
                throw new Error("Failed to get canvas context");
            }

            return {
                draw: (data: Uint8ClampedArray<ArrayBuffer>) => {
                    context.putImageData(
                        new ImageData(data, canvas.width, canvas.height),
                        0,
                        0,
                    );
                },
            };
        },
        [],
    );

    /**
     * 🛠 팀원분이 작성하신 핵심 카메라 & OpenCV 로직 (실시간 무한 루프)
     */
    useEffect(() => {
        const ac = new AbortController();

        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        width: 1000,
                        height: 1000,
                        facingMode: { ideal: "environment" },
                    },
                });

                const [track] = stream.getVideoTracks();
                const frameCapture = await createFrameCapture(ac.signal, track);
                
                const buffer = new Uint8ClampedArray(frameCapture.width * frameCapture.height * 4);
                
                // 종준님이 세팅한 videoCanvasRef에 팀원의 영상을 연결합니다!
                const canvas: HTMLCanvasElement = videoCanvasRef.current ?? todo("canvas가 없음");
                const drawer = createFrameDrawer(canvas, frameCapture.width, frameCapture.height);
                const cuebit = new Cuebit(frameCapture.width, frameCapture.height);

                await frameCapture.on(async (frame) => {
                    await frame.copyTo(buffer, {
                        format: "RGBA",
                        layout: [{ offset: 0, stride: frameCapture.width * 4 }],
                    });

                    // 여기서 OpenCV 로직이 실행됩니다 (현재는 HSV 변환)
                    const result = cuebit.process(buffer);
                    drawer.draw(result);
                });
            } catch (err) {
                console.error("카메라 에러:", err);
            }
        })();

        return () => {
            ac.abort();
        };
    }, [createFrameDrawer]);

    /**
     * ✨ 종준님의 AR 궤적 스위치 및 그리기 로직 (arCanvasRef 사용)
     */
    const toggleARMode = () => {
        setIsARMode(prev => {
            const nextState = !prev;
            const canvas = arCanvasRef.current; // arCanvasRef로 변경
            const mCtx = minimapCanvasRef.current?.getContext('2d');
            if (canvas) {
                canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
            }
            if (mCtx) {
                mCtx.clearRect(0, 0, minimapCanvasRef.current!.width, minimapCanvasRef.current!.height);
            }
            if (nextState && arCanvasRef.current) {
                drawTrajectory(arCanvasRef.current.width / 2, arCanvasRef.current.height / 4);
            }
            return nextState;
        });
    };

    const drawTrajectory = (targetX: number, targetY: number) => {
        if (!isARMode) return;
        const canvas = arCanvasRef.current; // arCanvasRef로 변경
        const minimapCanvas = minimapCanvasRef.current;
        if (!canvas || !containerRef.current || !minimapCanvas) return;
        
        const ctx = canvas.getContext('2d');
        const mCtx = minimapCanvas.getContext('2d');
        if (!ctx || !mCtx) return;

        const width = canvas.width;
        const height = canvas.height;

        const startX = width / 2;
        const startY = height - 250; 
        const dx = targetX - startX;
        const dy = targetY - startY;
        if (dx === 0 && dy === 0) return;

        let tMin = Infinity;
        let normalX = 0, normalY = 0;

        if (dx < 0) {
            const t = (0 - startX) / dx;
            if (t > 0 && t < tMin) { tMin = t; normalX = 1; normalY = 0; }
        } else if (dx > 0) {
            const t = (width - startX) / dx;
            if (t > 0 && t < tMin) { tMin = t; normalX = -1; normalY = 0; }
        }
        if (dy < 0) {
            const t = (0 - startY) / dy;
            if (t > 0 && t < tMin) { tMin = t; normalX = 0; normalY = 1; }
        } else if (dy > 0) {
            const t = (height - startY) / dy;
            if (t > 0 && t < tMin) { tMin = t; normalX = 0; normalY = -1; }
        }

        const collisionX = startX + dx * tMin;
        const collisionY = startY + dy * tMin;

        let reflectDirX = collisionX - startX;
        let reflectDirY = collisionY - startY;
        if (normalX !== 0) reflectDirX *= -1; 
        if (normalY !== 0) reflectDirY *= -1; 

        const length = Math.sqrt(reflectDirX * reflectDirX + reflectDirY * reflectDirY);
        const endX = collisionX + (reflectDirX / length) * 2000;
        const endY = collisionY + (reflectDirY / length) * 2000;

        ctx.clearRect(0, 0, width, height);
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00e5ff';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(collisionX, collisionY);
        ctx.setLineDash([6, 6]);
        ctx.stroke();

        ctx.shadowColor = '#ff4757';
        ctx.strokeStyle = '#ff4757';
        ctx.beginPath();
        ctx.moveTo(collisionX, collisionY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(startX, startY, 12, 0, 2 * Math.PI);
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'white';
        ctx.fill();

        mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
        const scaleX = minimapCanvas.width / width;
        const scaleY = minimapCanvas.height / height;
        mCtx.strokeStyle = '#00e5ff';
        mCtx.lineWidth = 1;
        mCtx.beginPath();
        mCtx.moveTo(startX * scaleX, startY * scaleY);
        mCtx.lineTo(collisionX * scaleX, collisionY * scaleY);
        mCtx.stroke();
        mCtx.strokeStyle = '#ff4757';
        mCtx.beginPath();
        mCtx.moveTo(collisionX * scaleX, collisionY * scaleY);
        mCtx.lineTo(endX * scaleX, endY * scaleY);
        mCtx.stroke();
        mCtx.beginPath();
        mCtx.arc(startX * scaleX, startY * scaleY, 3, 0, 2 * Math.PI);
        mCtx.fillStyle = 'white';
        mCtx.fill();
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).tagName !== 'DIV' && (e.target as HTMLElement).tagName !== 'CANVAS') return; 
        drawTrajectory(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length > 0) {
            drawTrajectory(e.touches[0].clientX, e.touches[0].clientY);
        }
    };

    // AR 도화지 크기를 브라우저 창 크기에 맞게 조절
    useEffect(() => {
        const handleResize = () => {
            const canvas = arCanvasRef.current;
            if (canvas && containerRef.current) {
                canvas.width = containerRef.current.clientWidth;
                canvas.height = containerRef.current.clientHeight;
                if (isARMode) drawTrajectory(canvas.width / 2, canvas.height / 4);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isARMode]);

    return (
        <div 
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onTouchMove={handleTouchMove}
            style={{ width: '100vw', height: '100vh', backgroundColor: '#111', overflow: 'hidden', position: 'relative', fontFamily: "'Pretendard', sans-serif" }}
        >
            {/* 1. 팀원의 카메라 영상 (비디오 태그 대신 캔버스로 출력, 꽉 차게 설정) */}
            <canvas 
                ref={videoCanvasRef} 
                style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, zIndex: 1 }} 
            />
            
            {/* 2. 종준님의 AR 네온 궤적 투명 도화지 (그 위에 겹침) */}
            <canvas 
                ref={arCanvasRef} 
                style={{ position: 'absolute', top: 0, left: 0, zIndex: 5, pointerEvents: 'none' }} 
            />
            
            {/* UI 요소들 (헤더, 미니맵, 하단 컨트롤 패널) */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '15px', zIndex: 10, background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)', boxSizing: 'border-box', pointerEvents: 'none', display: 'flex', flexDirection: 'column' }}>
                <div>
                    <h1 style={{ color: 'white', margin: 0, fontSize: '20px', fontWeight: '800', letterSpacing: '1px' }}>
                        Cue<span style={{ color: '#00e5ff' }}>bit</span>
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', margin: '3px 0 0 0', fontSize: '11px' }}>Real-time Trajectory</p>
                </div>
                {isARMode && (
                    <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 9px', borderRadius: '20px', border: '1px solid #ff4757', width: 'fit-content' }}>
                        <div style={{ width: '5px', height: '5px', backgroundColor: '#ff4757', borderRadius: '50%', marginRight: '6px', animation: 'blink 1s infinite' }} />
                        <span style={{ color: '#ff4757', fontSize: '9px', fontWeight: 'bold' }}>실시간 분석 중...</span>
                    </div>
                )}
            </div>

            <div style={{ position: 'absolute', top: '60px', right: '15px', width: '70px', height: '120px', backgroundColor: 'rgba(26, 60, 43, 0.85)', border: '2px solid #00e5ff', borderRadius: '8px', zIndex: 20, boxShadow: '0 0 10px rgba(0, 229, 255, 0.4)', backdropFilter: 'blur(5px)', overflow: 'hidden', transition: 'opacity 0.3s', opacity: isARMode ? 1 : 0.3 }}>
                <p style={{ color: '#00e5ff', textAlign: 'center', fontSize: '8px', margin: '6px 0', fontWeight: 'bold', letterSpacing: '1px', position: 'absolute', width: '100%', top: 0, zIndex: 21, pointerEvents: 'none' }}>MINIMAP</p>
                <canvas ref={minimapCanvasRef} width={70} height={120} style={{ position: 'absolute', top: 0, left: 0, zIndex: 20, pointerEvents: 'none' }} />
            </div>

            <div style={{ position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: '60%', maxWidth: '200px', backgroundColor: 'rgba(20, 20, 20, 0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
                <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '8px', padding: '2px' }}>
                    <button onClick={() => setMode('3구')} style={toggleStyle(mode === '3구')}>3구 모드</button>
                    <button onClick={() => setMode('4구')} style={toggleStyle(mode === '4구')}>4구 모드</button>
                </div>
                <button 
                    onClick={toggleARMode} 
                    style={{ 
                        width: '100%', padding: '8px', fontSize: '11px', 
                        background: isARMode ? 'rgba(255, 71, 87, 0.2)' : 'linear-gradient(135deg, #00e5ff 0%, #007BFF 100%)', 
                        color: isARMode ? '#ff4757' : 'white', border: isARMode ? '1px solid #ff4757' : 'none', 
                        borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: isARMode ? 'none' : '0 2px 8px rgba(0, 229, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.3s'
                    }}
                >
                    {isARMode ? '⏹ AR 종료' : '▶️ AR 시작'}
                </button>
            </div>

            <style>
                {`@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }`}
            </style>
        </div>
    );
}

const toggleStyle = (isActive: boolean) => ({
    flex: 1, padding: '5px 0', backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
    color: isActive ? '#fff' : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: '6px',
    fontWeight: '600' as const, fontSize: '10px', cursor: 'pointer', transition: 'all 0.3s ease',
    boxShadow: isActive ? '0 2px 5px rgba(0,0,0,0.2)' : 'none'
});

export default Main;