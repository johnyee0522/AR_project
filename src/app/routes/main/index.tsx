// src/app/routes/main/index.tsx
import { useRef, useCallback, useState } from "react";
import type { PhysicsResult } from "@/types/physics";
import type { DebugView } from "@/lib/cuebit";
import useCamera from "@/hooks/useCamera";
import useAR from "@/hooks/useAR";
import ARButton from "@/components/ARButton/ARButton";
import Minimap from "@/components/Minimap/Minimap";
import DebugViewToggle from "@/components/DebugViewToggle/DebugViewToggle";
import DevLog from "@/components/DevLog/DevLog";
import styles from "./Main.module.css";

function Main() {
    const videoCanvasRef = useRef<HTMLCanvasElement>(null);
    const arCanvasRef = useRef<HTMLCanvasElement>(null);
    const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [debugView, setDebugView] = useState<DebugView>("original");

    const [showTestPanel, setShowTestPanel] = useState(false);

    // 공 3개와 각도를 조작하기 위한 테스트 상태값
    const [testCue, setTestCue] = useState({ x: 200, y: 750 });
    const [testObj1, setTestObj1] = useState({ x: 500, y: 500 });
    const [testObj2, setTestObj2] = useState({ x: 700, y: 300 });
    const [testAngle, setTestAngle] = useState(45);

    const { isARMode, toggleARMode, drawAR } = useAR({
        arCanvasRef,
        minimapCanvasRef,
        containerRef,
    });

    const handleFrame = useCallback(
        (result: PhysicsResult | null) => {
            drawAR(result);
        },
        [drawAR],
    );

    const { cvLoaded, errorMsg } = useCamera({
        videoCanvasRef,
        debugView,
        onFrame: handleFrame,
        testProps: {
            cue: testCue,
            obj1: testObj1,
            obj2: testObj2,
            angle: testAngle,
        }
    });

    return (
        <div ref={containerRef} className={styles.container}>
            {/* 레이어 1~6 생략 (기존과 동일) */}
            <canvas ref={videoCanvasRef} className={styles.videoCanvas} />
            {!cvLoaded && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.spinner} />
                    <p className={styles.loadingText}>AI 비전 엔진 로딩 중...</p>
                </div>
            )}
            {errorMsg && <div className={styles.error}>{errorMsg}</div>}
            <canvas ref={arCanvasRef} className={styles.arCanvas} />
            
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Cue<span className={styles.titleAccent}>bit</span></h1>
                    <p className={styles.subtitle}>Real-time Trajectory</p>
                </div>
                {isARMode && cvLoaded && (
                    <div className={styles.analyzingBadge}>
                        <div className={styles.analyzingDot} />
                        <span className={styles.analyzingText}>실시간 분석 중...</span>
                    </div>
                )}
            </div>

            <Minimap ref={minimapCanvasRef} visible={isARMode && cvLoaded} />

            {/* 레이어 7: 하단 컨트롤 패널 */}
            <div className={styles.controls}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", justifyContent: "center" }}>
                    <DebugViewToggle current={debugView} onChange={setDebugView} />
                    <button 
                        onClick={() => setShowTestPanel(!showTestPanel)}
                        style={{
                            padding: "8px 12px",
                            backgroundColor: showTestPanel ? "#ff4757" : "#3742fa",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            fontWeight: "bold",
                            cursor: "pointer",
                            boxShadow: "0 4px 6px rgba(0,0,0,0.3)"
                        }}
                    >
                        ⚙️ 설정 {showTestPanel ? "닫기" : "열기"}
                    </button>
                </div>
                <ARButton isARMode={isARMode} onClick={toggleARMode} />
            </div>

            <DevLog />

            {showTestPanel && (
                <div style={{ 
                    position: "absolute", 
                    bottom: 160, 
                    left: 10, 
                    zIndex: 999, 
                    background: "rgba(0,0,0,0.4)",
                    backdropFilter: "blur(5px)",
                    padding: "10px", 
                    borderRadius: "8px", 
                    color: "white", 
                    fontSize: "12px", 
                    display: "grid", 
                    gridTemplateColumns: "1fr 1fr", 
                    gap: "10px", 
                    width: "90%", 
                    maxWidth: "400px" 
                }}>
                    <div>
                        <strong style={{ display: "block", marginBottom: "5px" }}>⚪ 수구</strong>
                        <label>X: <input type="range" min="0" max="1000" value={testCue.x} onChange={e => setTestCue({...testCue, x: Number(e.target.value)})} style={{width: "70px", verticalAlign: "middle"}}/></label><br/>
                        <label>Y: <input type="range" min="0" max="1000" value={testCue.y} onChange={e => setTestCue({...testCue, y: Number(e.target.value)})} style={{width: "70px", verticalAlign: "middle"}}/></label>
                    </div>
                    <div>
                        <strong style={{ display: "block", marginBottom: "5px" }}>🔴 적구 1</strong>
                        <label>X: <input type="range" min="0" max="1000" value={testObj1.x} onChange={e => setTestObj1({...testObj1, x: Number(e.target.value)})} style={{width: "70px", verticalAlign: "middle"}}/></label><br/>
                        <label>Y: <input type="range" min="0" max="1000" value={testObj1.y} onChange={e => setTestObj1({...testObj1, y: Number(e.target.value)})} style={{width: "70px", verticalAlign: "middle"}}/></label>
                    </div>
                    <div>
                        <strong style={{ display: "block", marginBottom: "5px" }}>🟡 적구 2</strong>
                        <label>X: <input type="range" min="0" max="1000" value={testObj2.x} onChange={e => setTestObj2({...testObj2, x: Number(e.target.value)})} style={{width: "70px", verticalAlign: "middle"}}/></label><br/>
                        <label>Y: <input type="range" min="0" max="1000" value={testObj2.y} onChange={e => setTestObj2({...testObj2, y: Number(e.target.value)})} style={{width: "70px", verticalAlign: "middle"}}/></label>
                    </div>
                    <div>
                        <strong style={{ display: "block", marginBottom: "5px" }}>📐 각도 ({testAngle}도)</strong>
                        <label><input type="range" min="0" max="360" value={testAngle} onChange={e => setTestAngle(Number(e.target.value))} style={{width: "100%", verticalAlign: "middle"}}/></label>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Main;