import React, { useEffect, useRef, useState } from "react";
import {
	calibratePowerTravel,
	estimatePowerTravel,
	POWER_LEVELS,
} from "@/lib/physics";
import styles from "./main.module.css";

interface BallPos {
	x: number;
	y: number;
}

interface TestPanelProps {
	cue: BallPos;
	obj1: BallPos;
	obj2: BallPos;
	angle: number;
	power: number;
	sideSpin: number;
	topBottomSpin: number;
	cueTravelMeters: number;
	onCueChange: (pos: BallPos) => void;
	onObj1Change: (pos: BallPos) => void;
	onObj2Change: (pos: BallPos) => void;
	onAngleChange: (angle: number) => void;
	onPowerChange: (power: number) => void;
	onSideSpinChange: (sideSpin: number) => void;
	onTopBottomSpinChange: (topBottomSpin: number) => void;
	onClose: () => void;
}

const SPIN_OFFSET_MM = 60;
const SPIN_OPTIONS = [
	{ label: "\uc0c1", sideSpin: 0, topBottomSpin: SPIN_OFFSET_MM },
	{ label: "\ud558", sideSpin: 0, topBottomSpin: -SPIN_OFFSET_MM },
	{ label: "\uc88c", sideSpin: -SPIN_OFFSET_MM, topBottomSpin: 0 },
	{ label: "\uc6b0", sideSpin: SPIN_OFFSET_MM, topBottomSpin: 0 },
] as const;

function getPowerLevel(power: number) {
	return POWER_LEVELS.reduce((closest, level) =>
		Math.abs(level.value - power) < Math.abs(closest.value - power)
			? level
			: closest,
	);
}

function getSpinOption(sideSpin: number, topBottomSpin: number) {
	return SPIN_OPTIONS.find(
		(option) =>
			option.sideSpin === sideSpin && option.topBottomSpin === topBottomSpin,
	);
}

const TestPanel: React.FC<TestPanelProps> = ({
	cue,
	obj1,
	obj2,
	angle,
	power,
	sideSpin,
	topBottomSpin,
	cueTravelMeters,
	onCueChange,
	onObj1Change,
	onObj2Change,
	onAngleChange,
	onPowerChange,
	onSideSpinChange,
	onTopBottomSpinChange,
	onClose,
}) => {
	const [position, setPosition] = useState({ x: 15, y: 150 });
	const isDragging = useRef(false);
	const offset = useRef({ x: 0, y: 0 });
	const panelRef = useRef<HTMLDivElement>(null);
	const currentPowerLevel = getPowerLevel(power);
	const currentSpinOption = getSpinOption(sideSpin, topBottomSpin);
	const baselineTravel = estimatePowerTravel(currentPowerLevel);
	const [targetTravelMeters, setTargetTravelMeters] = useState(
		() => Number(baselineTravel.travelMeters.toFixed(2)),
	);
	const targetTravelForCalibration = Math.max(0.01, targetTravelMeters);
	const calibration = calibratePowerTravel({
		power: currentPowerLevel.value,
		targetTravelMeters: targetTravelForCalibration,
	});

	const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
		const targetTag = (e.target as HTMLElement).tagName;
		if (targetTag === "INPUT" || targetTag === "BUTTON") return;

		isDragging.current = true;
		const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
		const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

		if (panelRef.current) {
			const rect = panelRef.current.getBoundingClientRect();
			offset.current = {
				x: clientX - rect.left,
				y: clientY - rect.top,
			};
		}
	};

	useEffect(() => {
		const handleMove = (e: MouseEvent | TouchEvent) => {
			if (!isDragging.current) return;
			const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
			const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
			setPosition({
				x: clientX - offset.current.x,
				y: clientY - offset.current.y,
			});
		};
		const handleEnd = () => {
			isDragging.current = false;
		};

		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleEnd);
		window.addEventListener("touchmove", handleMove, { passive: false });
		window.addEventListener("touchend", handleEnd);
		return () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleEnd);
			window.removeEventListener("touchmove", handleMove);
			window.removeEventListener("touchend", handleEnd);
		};
	}, []);

	const selectSpin = (option: (typeof SPIN_OPTIONS)[number]) => {
		if (currentSpinOption?.label === option.label) {
			onSideSpinChange(0);
			onTopBottomSpinChange(0);
			return;
		}

		onSideSpinChange(option.sideSpin);
		onTopBottomSpinChange(option.topBottomSpin);
	};

	const selectPower = (level: (typeof POWER_LEVELS)[number]) => {
		onPowerChange(level.value);
		setTargetTravelMeters(Number(estimatePowerTravel(level).travelMeters.toFixed(2)));
	};

	return (
		<div
			ref={panelRef}
			className={styles.testPanel}
			style={{
				left: `${position.x}px`,
				top: `${position.y}px`,
				right: "auto",
				maxHeight: "80vh",
				overflowY: "auto",
			}}
			onMouseDown={handleStart}
			onTouchStart={handleStart}
		>
			<div className={styles.testPanelHeader}>
				<h3>{"\ubb3c\ub9ac \ud14c\uc2a4\ud2b8"}</h3>
				<button type="button" onClick={onClose}>
					x
				</button>
			</div>

			<div className={styles.testGroup}>
				<label>{`\uc218\uad6c X: ${cue.x} / Y: ${cue.y}`}</label>
				<input type="range" min="0" max="1000" value={cue.x} onChange={(e) => onCueChange({ ...cue, x: Number(e.target.value) })} />
				<input type="range" min="0" max="1000" value={cue.y} onChange={(e) => onCueChange({ ...cue, y: Number(e.target.value) })} />
			</div>

			<div className={styles.testGroup}>
				<label>{`\ubaa9\uc801\uad6c 1 X: ${obj1.x} / Y: ${obj1.y}`}</label>
				<input type="range" min="0" max="1000" value={obj1.x} onChange={(e) => onObj1Change({ ...obj1, x: Number(e.target.value) })} />
				<input type="range" min="0" max="1000" value={obj1.y} onChange={(e) => onObj1Change({ ...obj1, y: Number(e.target.value) })} />
			</div>

			<div className={styles.testGroup}>
				<label>{`\ubaa9\uc801\uad6c 2 X: ${obj2.x} / Y: ${obj2.y}`}</label>
				<input type="range" min="0" max="1000" value={obj2.x} onChange={(e) => onObj2Change({ ...obj2, x: Number(e.target.value) })} />
				<input type="range" min="0" max="1000" value={obj2.y} onChange={(e) => onObj2Change({ ...obj2, y: Number(e.target.value) })} />
			</div>

			<div className={styles.testGroup}>
				<label>{`\ud0c0\uaca9 \uac01\ub3c4: ${angle}\u00b0`}</label>
				<input type="range" min="0" max="360" value={angle} onChange={(e) => onAngleChange(Number(e.target.value))} />
			</div>

			<div className={styles.testGroup}>
				<label>{`\ud0c0\uaca9 \uac15\ub3c4: ${currentPowerLevel.label}`}</label>
				<div className={styles.powerLevelGroup}>
					{POWER_LEVELS.map((level) => (
						<button
							key={level.label}
							type="button"
							className={`${styles.powerLevelButton} ${
								currentPowerLevel.label === level.label ? styles.active : ""
							}`}
							onClick={() => selectPower(level)}
						>
							{level.label}
						</button>
					))}
				</div>
			</div>

			<div className={styles.testGroup}>
				<label>
					{`\uc608\uc0c1 \uc218\uad6c \uc774\ub3d9\uac70\ub9ac: ${cueTravelMeters.toFixed(2)}m`}
				</label>
				<label>
					{`\uae30\uc900 \uc774\ub3d9\uac70\ub9ac: ${baselineTravel.travelMeters.toFixed(2)}m`}
				</label>
			</div>

			<div className={styles.testGroup}>
				<label>
					{`\uc2e4\uce21 \ubaa9\ud45c \uac70\ub9ac: ${targetTravelMeters.toFixed(2)}m`}
				</label>
				<input
					className={styles.numberInput}
					type="number"
					min="0.01"
					max="20"
					step="0.01"
					value={targetTravelMeters.toFixed(2)}
					onChange={(e) => setTargetTravelMeters(Number(e.target.value))}
				/>
				<label>
					{`\uad8c\uc7a5 rollingFriction: ${calibration.rollingFriction.toFixed(4)}`}
				</label>
			</div>

			<div className={styles.testGroup}>
				<label>
					{`\uc2a4\ud540: ${currentSpinOption?.label ?? "\uc120\ud0dd \uc548 \ub428"}`}
				</label>
				<div className={styles.spinDirectionGroup}>
					{SPIN_OPTIONS.map((option) => (
						<button
							key={option.label}
							type="button"
							className={`${styles.spinDirectionButton} ${
								currentSpinOption?.label === option.label ? styles.active : ""
							}`}
							onClick={() => selectSpin(option)}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>
		</div>
	);
};

export default TestPanel;
