import { useRef, useCallback, useState } from "react";
import type { PhysicsResult } from "@/types/physics";
import type { DebugView } from "@/lib/cuebit";
import useCamera from "@/hooks/useCamera";
import useAR from "@/hooks/useAR";
import ARButton from "@/components/ARButton/ARButton";
import Minimap from "@/components/Minimap/Minimap";
import DebugViewToggle from "@/components/DebugViewToggle/DebugViewToggle";
import DevLog from "@/components/DevLog/DevLog";
import TestController from "@/components/TestController/TestController";
import styles from "./Main.module.css";

function Main() {
    const videoCanvasRef = useRef<HTMLCanvasElement>(null);
    const arCanvasRef = useRef<HTMLCanvasElement>(null);
    const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [debugView, setDebugView] = useState<DebugView>("original");
    const [showTestPanel, setShowTestPanel] = useState(false);

    // 공 3개와 각도 상태 관리
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
            {/* 레이어 1: 카메라 영상 */}
            <canvas ref={videoCanvasRef} className={styles.videoCanvas} />

            {/* 레이어 2: 로딩 오버레이 */}
            {!cvLoaded && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.spinner} />
                    <p className={styles.loadingText}>AI 비전 엔진 로딩 중...</p>
                </div>
            )}

            {/* 레이어 3: 에러 메시지 */}
            {errorMsg && <div className={styles.error}>{errorMsg}</div>}

            {/* 레이어 4: AR 궤적 오버레이 */}
            <canvas ref={arCanvasRef} className={styles.arCanvas} />
            
            {/* 레이어 5: 상단 헤더 */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>
                        Cue<span className={styles.titleAccent}>bit</span>
                    </h1>
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

            {/* 레이어 7: 하단 컨트롤 섹션 */}
            <div className={styles.controls}>
                <div className={styles.buttonRow}>
                    <DebugViewToggle current={debugView} onChange={setDebugView} />
                    
                    {/* 설정 패널 토글 버튼 */}
                    <button 
                        className={`${styles.configButton} ${showTestPanel ? styles.active : ""}`}
                        onClick={() => setShowTestPanel(!showTestPanel)}
                    >
                        ⚙️ 설정 {showTestPanel ? "닫기" : "열기"}
                    </button>
                </div>
                <ARButton isARMode={isARMode} onClick={toggleARMode} />
            </div>

            {/* 레이어 8: 개발 로그 */}
            <DevLog />

            {/* 레이어 9: 테스트 컨트롤러 패널 (분리된 외부 컴포넌트) */}
            <TestController 
                show={showTestPanel}
                testCue={testCue}
                setTestCue={setTestCue}
                testObj1={testObj1}
                setTestObj1={setTestObj1}
                testObj2={testObj2}
                setTestObj2={setTestObj2}
                testAngle={testAngle}
                setTestAngle={setTestAngle}
            />
        </div>
    );
}

export default Main;