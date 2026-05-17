import { useCallback, useRef, useState } from "react";
import ARButton from "@/components/ar_button/ar_button";
import DevLog from "@/components/dev_log/dev_log";
import Minimap from "@/components/minimap/minimap";
import useAR from "@/hooks/use_ar";
import useCamera from "@/hooks/use_camera";
import useSimulation from "@/hooks/use_simulation";
import { toPredictShotInput } from "@/lib/physics";
import type { DetectedState } from "@/types/detection";
import type { BallPositions, PhysicsResult } from "@/types/physics";
import TestPanel from "./test_panel";
import styles from "./main.module.css";

const DEFAULT_BALL_POSITIONS: BallPositions = {
	cueBall: { x: 0.57, y: 1.07 },
	red: { x: 1.42, y: 0.71 },
	yellow: { x: 1.99, y: 0.43 },
};

const TEST_PANEL_BALLS = [
	{ id: "cueBall", label: "\uc218\uad6c" },
	{ id: "red", label: "\ubaa9\uc801\uad6c 1" },
	{ id: "yellow", label: "\ubaa9\uc801\uad6c 2" },
] as const;

function Main() {
	const videoCanvasRef = useRef<HTMLCanvasElement>(null);
	const arCanvasRef = useRef<HTMLCanvasElement>(null);
	const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const predictionCacheRef = useRef<{
		key: string;
		result: PhysicsResult;
	} | null>(null);

	const [gameState, setGameState] = useState({
		balls: DEFAULT_BALL_POSITIONS,
		angleDeg: 45,
		power: 0.5,
		sideSpin: 0,
		topSpin: 0,
	});
	const [isTestPanelOpen, setIsTestPanelOpen] = useState(false);
	const [cueTravelMeters, setCueTravelMeters] = useState(0);

	const { isARMode, toggleARMode, drawAR } = useAR({
		arCanvasRef,
		minimapCanvasRef,
		containerRef,
	});
	const { sim, tuningVersion } = useSimulation();

	const handleFrame = useCallback(
		(detected: DetectedState | null) => {
			const predictInput = detected
				? toPredictShotInput(detected)
				: {
						balls: gameState.balls,
						angleDeg: gameState.angleDeg,
						power: gameState.power,
						sideSpin: gameState.sideSpin,
						topSpin: gameState.topSpin,
						maxSteps: 2400,
					};
			const predictionKey = JSON.stringify({
				predictInput,
				tuningVersion,
			});

			let physicsResult = predictionCacheRef.current?.result;
			if (!physicsResult || predictionCacheRef.current?.key !== predictionKey) {
				sim.updateBallPositionsMeters(predictInput.balls);
				physicsResult = sim.predict(
					predictInput.angleDeg,
					predictInput.power,
					predictInput.maxSteps,
					predictInput.sideSpin,
					predictInput.topSpin,
				);
				predictionCacheRef.current = {
					key: predictionKey,
					result: physicsResult,
				};
			}

			const nextCueTravel =
				physicsResult.summary?.travelDistanceByBall["cueBall"] ?? 0;
			setCueTravelMeters((prev) =>
				Math.abs(prev - nextCueTravel) > 0.005 ? nextCueTravel : prev,
			);

			drawAR(physicsResult);
		},
		[drawAR, sim, gameState, tuningVersion],
	);

	const { cameraReady, errorMsg } = useCamera({
		videoCanvasRef,
		onFrame: handleFrame,
		devInput: {
			balls: gameState.balls,
			angleDeg: gameState.angleDeg,
			power: gameState.power,
			sideSpin: gameState.sideSpin,
			topSpin: gameState.topSpin,
			cueBallId: "cueBall",
		},
	});

	return (
		<div ref={containerRef} className={styles.container}>
			<canvas ref={videoCanvasRef} className={styles.videoCanvas} />

			{!cameraReady && (
				<div className={styles.loadingOverlay}>
					<div className={styles.spinner} />
					<p className={styles.loadingText}>
						{"\uce74\uba54\ub77c \uc900\ube44 \uc911..."}
					</p>
				</div>
			)}

			{errorMsg && <div className={styles.error}>{errorMsg}</div>}

			<canvas ref={arCanvasRef} className={styles.arCanvas} />

			<div className={styles.header}>
				<div>
					<h1 className={styles.title}>
						Cue<span className={styles.titleAccent}>bit</span>
					</h1>
					<p className={styles.subtitle}>
						{"\uc2e4\uc2dc\uac04 \uada4\uc801 \uac00\uc774\ub4dc"}
					</p>
				</div>
				{isARMode && cameraReady && (
					<div className={styles.analyzingBadge}>
						<div className={styles.analyzingDot} />
						<span className={styles.analyzingText}>
							{"\uc2e4\uc2dc\uac04 \uc608\uce21 \uc911"}
						</span>
					</div>
				)}
			</div>

			<Minimap ref={minimapCanvasRef} visible={isARMode && cameraReady} />

			{isTestPanelOpen && (
				<TestPanel
					balls={gameState.balls}
					ballControls={TEST_PANEL_BALLS}
					angleDeg={gameState.angleDeg}
					power={gameState.power}
					sideSpin={gameState.sideSpin}
					topSpin={gameState.topSpin}
					cueTravelMeters={cueTravelMeters}
					onBallChange={(ballId, pos) =>
						setGameState((prev) => ({
							...prev,
							balls: { ...prev.balls, [ballId]: pos },
						}))
					}
					onAngleDegChange={(angleDeg) =>
						setGameState((prev) => ({ ...prev, angleDeg }))
					}
					onPowerChange={(power) =>
						setGameState((prev) => ({ ...prev, power }))
					}
					onSideSpinChange={(sideSpin) =>
						setGameState((prev) => ({ ...prev, sideSpin }))
					}
					onTopSpinChange={(topSpin) =>
						setGameState((prev) => ({ ...prev, topSpin }))
					}
					onClose={() => setIsTestPanelOpen(false)}
				/>
			)}

			<div className={styles.controls}>
				<div className={styles.debugRow}>
					<div className={styles.debugGroup}>
						<span className={styles.debugLabel}>TEST</span>
						<div className={styles.debugTrack}>
							<button
								type="button"
								className={`${styles.openTestBtn} ${
									isTestPanelOpen ? styles.active : ""
								}`}
								onClick={() => setIsTestPanelOpen((prev) => !prev)}
							>
								Panel
							</button>
						</div>
					</div>
				</div>
				<ARButton isARMode={isARMode} onClick={toggleARMode} />
			</div>

			<DevLog />
		</div>
	);
}

export default Main;
