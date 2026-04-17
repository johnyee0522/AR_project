import { useRef, useCallback, useState } from "react";
import type { DebugView } from "@/lib/cuebit";
import useCamera, { type DetectedState } from "@/hooks/use_camera";
import useAR from "@/hooks/use_ar";
import useSimulation from "@/hooks/use_simulation";
import ARButton from "@/components/ar_button/ar_button";
import Minimap from "@/components/minimap/minimap";
import DebugViewToggle from "@/components/debug_view_toggle/debug_view_toggle";
import DevLog from "@/components/dev_log/dev_log";
import TestPanel from "./test_panel";
import styles from "./main.module.css";

/**
 * 메인 애플리케이션 화면: 카메라 비전, 물리 시뮬레이션 및 AR 오버레이 통합
 */
function Main() {
	const videoCanvasRef = useRef<HTMLCanvasElement>(null);
	const arCanvasRef = useRef<HTMLCanvasElement>(null);
	const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const [debugView, setDebugView] = useState<DebugView>("original");

	// 시뮬레이션 파라미터를 위한 게임 상태
	const [gameState, setGameState] = useState({
		balls: {
			cue: { x: 200, y: 750 },
			red: { x: 500, y: 500 },
			yellow: { x: 700, y: 300 },
		},
		angle: 45,
		power: 1.5,
	});
	const [isTestPanelOpen, setIsTestPanelOpen] = useState(true);

	const { isARMode, toggleARMode, drawAR } = useAR({
		arCanvasRef,
		minimapCanvasRef,
		containerRef,
	});

	const { sim } = useSimulation();

	/**
	 * 각 카메라 프레임 처리: 물리 월드 업데이트 및 AR 시각화 드로잉
	 */
	const handleFrame = useCallback(
		(detected: DetectedState | null) => {
			if (!sim) {
				drawAR(null);
				return;
			}

			// 비전 엔진에서 감지된 공 위치를 수동 설정값보다 우선시함
			const balls = detected?.balls || gameState.balls;
			const angle = detected?.angle ?? gameState.angle;
			const power = gameState.power;

			sim.updateBallPositions(balls);
			const physicsResult = sim.predict(angle, power);

			drawAR(physicsResult);
		},
		[drawAR, sim, gameState],
	);

	const { cvLoaded, errorMsg } = useCamera({
		videoCanvasRef,
		debugView,
		onFrame: handleFrame,
		testProps: {
			cue: gameState.balls.cue,
			obj1: gameState.balls.red,
			obj2: gameState.balls.yellow,
			angle: gameState.angle,
		},
	});

	return (
		<div ref={containerRef} className={styles.container}>
			<canvas ref={videoCanvasRef} className={styles.videoCanvas} />

			{/* 로딩 오버레이 */}
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
					<h1 className={styles.title}>
						Cue<span className={styles.titleAccent}>bit</span>
					</h1>
					<p className={styles.subtitle}>실시간 궤적 가이드</p>
				</div>
				{isARMode && cvLoaded && (
					<div className={styles.analyzingBadge}>
						<div className={styles.analyzingDot} />
						<span className={styles.analyzingText}>실시간 분석 중...</span>
					</div>
				)}
			</div>

			<Minimap ref={minimapCanvasRef} visible={isARMode && cvLoaded} />

			{isTestPanelOpen && (
				<TestPanel
					cue={gameState.balls.cue}
					obj1={gameState.balls.red}
					obj2={gameState.balls.yellow}
					angle={gameState.angle}
					power={gameState.power}
					onCueChange={(pos) =>
						setGameState((prev) => ({
							...prev,
							balls: { ...prev.balls, cue: pos },
						}))
					}
					onObj1Change={(pos) =>
						setGameState((prev) => ({
							...prev,
							balls: { ...prev.balls, red: pos },
						}))
					}
					onObj2Change={(pos) =>
						setGameState((prev) => ({
							...prev,
							balls: { ...prev.balls, yellow: pos },
						}))
					}
					onAngleChange={(angle) =>
						setGameState((prev) => ({ ...prev, angle }))
					}
					onPowerChange={(power) =>
						setGameState((prev) => ({ ...prev, power }))
					}
					onClose={() => setIsTestPanelOpen(false)}
				/>
			)}

			<div className={styles.controls}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "10px",
						marginBottom: "10px",
						justifyContent: "center",
					}}
				>
					<button
						className={styles.openTestBtn}
						onClick={() => setIsTestPanelOpen((prev) => !prev)}
					>
						{isTestPanelOpen ? "닫기" : "테스트 패널"}
					</button>
					<DebugViewToggle current={debugView} onChange={setDebugView} />
				</div>
				<ARButton isARMode={isARMode} onClick={toggleARMode} />
			</div>

			<DevLog />
		</div>
	);
}

export default Main;
