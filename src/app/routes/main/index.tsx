import { useCallback, useEffect, useRef, useState } from "react";
import createFrameCapture from "@/lib/capture";
import Cuebit from "@/lib/cuebit";
import { todo } from "@/common";
import { getOpenCv } from "@/lib/opencv";

function Main() {
    const videoCanvasRef = useRef<HTMLCanvasElement>(null);
    const arCanvasRef = useRef<HTMLCanvasElement>(null);
    const minimapCanvasRef = useRef<HTMLCanvasElement>(null); 
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [mode, setMode] = useState<string>('4구');
    const [isARMode, setIsARMode] = useState<boolean>(false);
    const isARModeRef = useRef(false);

    const [cvLoaded, setCvLoaded] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string>('');

    // ✨ 내가 화면을 터치한 곳의 좌표를 저장하는 장치
    const touchPosRef = useRef<{ x: number, y: number } | null>(null);

    const createFrameDrawer = useCallback(
        (canvas: HTMLCanvasElement, width: number, height: number) => {
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) { throw new Error("Failed to get canvas context"); }
            return {
                draw: (data: Uint8ClampedArray<ArrayBuffer>) => {
                    context.putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0);
                },
            };
        },
        [],
    );

    // ✨ 궤적 그리기 (터치한 곳 -> 빨간 물체)
    const drawTrajectory = (targetX: number, targetY: number) => {
        if (!isARModeRef.current) return;
        const canvas = arCanvasRef.current;
        const minimapCanvas = minimapCanvasRef.current;
        if (!canvas || !containerRef.current || !minimapCanvas) return;
        
        const ctx = canvas.getContext('2d');
        const mCtx = minimapCanvas.getContext('2d');
        if (!ctx || !mCtx) return;

        const width = canvas.width;
        const height = canvas.height;

        // ✨ 시작점: 화면을 터치한 기록이 있으면 그곳으로, 없으면 화면 중앙 하단으로 설정!
        let startX = width / 2;
        let startY = height - 150; 
        if (touchPosRef.current) {
            startX = touchPosRef.current.x;
            startY = touchPosRef.current.y;
        }

        // 도화지 초기화
        ctx.clearRect(0, 0, width, height);
        mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

        // 1. 메인 캔버스: 터치한 곳에서 빨간 공까지 점선 그리기 (반사 삭제)
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00e5ff';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(targetX, targetY); // 빨간 공까지 다이렉트!
        ctx.setLineDash([6, 6]);
        ctx.stroke();

        // 수구(터치한 내 공) 위치 표시 원
        ctx.beginPath();
        ctx.arc(startX, startY, 12, 0, 2 * Math.PI);
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'white';
        ctx.fill();

        // 2. 미니맵 캔버스 업데이트
        const scaleX = minimapCanvas.width / width;
        const scaleY = minimapCanvas.height / height;

        mCtx.strokeStyle = '#00e5ff';
        mCtx.lineWidth = 1;
        mCtx.beginPath();
        mCtx.moveTo(startX * scaleX, startY * scaleY);
        mCtx.lineTo(targetX * scaleX, targetY * scaleY);
        mCtx.stroke();

        mCtx.beginPath();
        mCtx.arc(startX * scaleX, startY * scaleY, 3, 0, 2 * Math.PI);
        mCtx.fillStyle = 'white';
        mCtx.fill();
    };

    useEffect(() => {
        const ac = new AbortController();
        const startApp = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false, video: { width: 1000, height: 1000, facingMode: { ideal: "environment" } },
                });

                const [track] = stream.getVideoTracks();
                const frameCapture = await createFrameCapture(ac.signal, track);
                const buffer = new Uint8ClampedArray(frameCapture.width * frameCapture.height * 4);
                
                const canvas: HTMLCanvasElement = videoCanvasRef.current ?? todo("canvas가 없음");
                const drawer = createFrameDrawer(canvas, frameCapture.width, frameCapture.height);

                await getOpenCv(); 
                setCvLoaded(true); 

                const cuebit = new Cuebit(frameCapture.width, frameCapture.height);

                await frameCapture.on(async (frame) => {
                    await frame.copyTo(buffer, {
                        format: "RGBA", layout: [{ offset: 0, stride: frameCapture.width * 4 }],
                    });

                    if (cuebit) {
                        const { frameBuffer, ballPos } = cuebit.process(buffer);
                        drawer.draw(frameBuffer);

                        if (ballPos && isARModeRef.current && arCanvasRef.current) {
                            const scaleX = arCanvasRef.current.width / frameCapture.width;
                            const scaleY = arCanvasRef.current.height / frameCapture.height;
                            drawTrajectory(ballPos.x * scaleX, ballPos.y * scaleY);
                        } else if (arCanvasRef.current) {
                            const ctx = arCanvasRef.current.getContext('2d');
                            const mCtx = minimapCanvasRef.current?.getContext('2d');
                            ctx?.clearRect(0, 0, arCanvasRef.current.width, arCanvasRef.current.height);
                            mCtx?.clearRect(0, 0, minimapCanvasRef.current!.width, minimapCanvasRef.current!.height);
                        }
                    }
                });
            } catch (err) {
                console.error("앱 시작 에러:", err);
                setErrorMsg('카메라 또는 AI 엔진을 켜지 못했습니다. HTTPS 배포 환경에서 테스트해주세요.');
            }
        };

        startApp();
        return () => { ac.abort(); };
    }, [createFrameDrawer]);

    const toggleARMode = () => {
        setIsARMode(prev => {
            const nextState = !prev;
            isARModeRef.current = nextState; 
            // AR을 다시 켤 때 터치 기록 초기화 (다시 화면 중앙부터 시작)
            if (nextState) touchPosRef.current = null;
            return nextState;
        });
    };

    // ✨ 사용자가 화면을 터치(또는 마우스 클릭/드래그)할 때 위치를 감지하는 함수
    const handlePointerEvent = (e: React.PointerEvent<HTMLDivElement>) => {
        // UI 버튼 같은 걸 눌렀을 때는 무시하고, 배경 도화지를 터치했을 때만 인식
        const target = e.target as HTMLElement;
        if (target.tagName !== 'CANVAS' && target.tagName !== 'DIV') return;
        
        touchPosRef.current = { x: e.clientX, y: e.clientY };
    };

    useEffect(() => {
        const handleResize = () => {
            const canvas = arCanvasRef.current;
            if (canvas && containerRef.current) {
                canvas.width = containerRef.current.clientWidth; canvas.height = containerRef.current.clientHeight;
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        // ✨ onPointerDown(누를 때), onPointerMove(드래그할 때) 이벤트를 화면 전체에 달아줍니다.
        <div 
            ref={containerRef} 
            onPointerDown={handlePointerEvent}
            onPointerMove={handlePointerEvent}
            style={{ width: '100vw', height: '100vh', backgroundColor: '#111', overflow: 'hidden', position: 'relative', fontFamily: "'Pretendard', sans-serif", touchAction: 'none' }}
        >
            
            <canvas ref={videoCanvasRef} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, zIndex: 1 }} />
            
            {!cvLoaded && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 3, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.2)', borderTop: '3px solid #00e5ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <p style={{ color: '#00e5ff', marginTop: '15px', fontSize: '12px', fontWeight: 'bold' }}>AI 비전 엔진 로딩 중...</p>
                </div>
            )}

            {errorMsg && (
                <div style={{ position: 'absolute', bottom: '100px', width: '80%', left: '10%', zIndex: 20, backgroundColor: 'rgba(255, 71, 87, 0.9)', color: 'white', padding: '10px', borderRadius: '8px', fontSize: '11px', textAlign: 'center' }}>
                    {errorMsg}
                </div>
            )}

            <canvas ref={arCanvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 5, pointerEvents: 'none' }} />
            
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '15px', zIndex: 10, background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)', boxSizing: 'border-box', pointerEvents: 'none', display: 'flex', flexDirection: 'column' }}>
                <div>
                    <h1 style={{ color: 'white', margin: 0, fontSize: '20px', fontWeight: '800', letterSpacing: '1px' }}> Cue<span style={{ color: '#00e5ff' }}>bit</span> </h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', margin: '3px 0 0 0', fontSize: '11px' }}>Real-time Trajectory</p>
                </div>
                {(isARMode && cvLoaded) && (
                    <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 9px', borderRadius: '20px', border: '1px solid #ff4757', width: 'fit-content' }}>
                        <div style={{ width: '5px', height: '5px', backgroundColor: '#ff4757', borderRadius: '50%', marginRight: '6px', animation: 'blink 1s infinite' }} />
                        <span style={{ color: '#ff4757', fontSize: '9px', fontWeight: 'bold' }}>실시간 분석 중...</span>
                    </div>
                )}
            </div>
            <div style={{ position: 'absolute', top: '60px', right: '15px', width: '70px', height: '120px', backgroundColor: 'rgba(26, 60, 43, 0.85)', border: '2px solid #00e5ff', borderRadius: '8px', zIndex: 20, boxShadow: '0 0 10px rgba(0, 229, 255, 0.4)', backdropFilter: 'blur(5px)', overflow: 'hidden', transition: 'opacity 0.3s', opacity: (isARMode && cvLoaded) ? 1 : 0.3 }}>
                <p style={{ color: '#00e5ff', textAlign: 'center', fontSize: '8px', margin: '6px 0', fontWeight: 'bold', letterSpacing: '1px', position: 'absolute', width: '100%', top: 0, zIndex: 21, pointerEvents: 'none' }}>MINIMAP</p>
                <canvas ref={minimapCanvasRef} width={70} height={120} style={{ position: 'absolute', top: 0, left: 0, zIndex: 20, pointerEvents: 'none' }} />
            </div>
            <div style={{ position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: '60%', maxWidth: '200px', backgroundColor: 'rgba(20, 20, 20, 0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
                <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '8px', padding: '2px' }}>
                    <button onClick={() => setMode('3구')} style={toggleStyle(mode === '3구')}>3구 모드</button>
                    <button onClick={() => setMode('4구')} style={toggleStyle(mode === '4구')}>4구 모드</button>
                </div>
                <button onClick={toggleARMode} style={{ width: '100%', padding: '8px', fontSize: '11px', background: isARMode ? 'rgba(255, 71, 87, 0.2)' : 'linear-gradient(135deg, #00e5ff 0%, #007BFF 100%)', color: isARMode ? '#ff4757' : 'white', border: isARMode ? '1px solid #ff4757' : 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', boxShadow: isARMode ? 'none' : '0 2px 8px rgba(0, 229, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.3s' }}>
                    {isARMode ? '⏹ AR 종료' : '▶️ AR 시작'}
                </button>
            </div>
            <style>
                {`@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
                  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
            </style>
        </div>
    );
}

const toggleStyle = (isActive: boolean) => ({
    flex: 1, padding: '5px 0', backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'transparent', color: isActive ? '#fff' : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: '6px', fontWeight: '600' as const, fontSize: '10px', cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: isActive ? '0 2px 5px rgba(0,0,0,0.2)' : 'none'
});

export default Main;