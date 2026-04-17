import React, { useState, useRef, useEffect } from "react";
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
	onCueChange: (pos: BallPos) => void;
	onObj1Change: (pos: BallPos) => void;
	onObj2Change: (pos: BallPos) => void;
	onAngleChange: (angle: number) => void;
	onPowerChange: (power: number) => void;
	onSideSpinChange: (sideSpin: number) => void;
	onTopBottomSpinChange: (topBottomSpin: number) => void;
	onClose: () => void;
}

/**
 * 물리 기반 테스트 컨트롤러: 실제 당구의 팁 오프셋(mm) 단위를 사용
 */
const TestPanel: React.FC<TestPanelProps> = ({
	cue,
	obj1,
	obj2,
	angle,
	power,
	sideSpin,
	topBottomSpin,
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

	const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
		if ((e.target as HTMLElement).tagName === "INPUT") return;
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
		const handleEnd = () => { isDragging.current = false; };
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
				<h3>물리 테스트 (단위: mm)</h3>
				<button onClick={(e) => { e.stopPropagation(); onClose(); }}>×</button>
			</div>

			<div className={styles.testGroup}>
				<label>수구 X: {cue.x} / Y: {cue.y}</label>
				<input type="range" min="0" max="1000" value={cue.x} onChange={(e) => onCueChange({ ...cue, x: Number(e.target.value) })} />
				<input type="range" min="0" max="1000" value={cue.y} onChange={(e) => onCueChange({ ...cue, y: Number(e.target.value) })} />
			</div>

			<div className={styles.testGroup}>
				<label>적구1 X: {obj1.x} / Y: {obj1.y}</label>
				<input type="range" min="0" max="1000" value={obj1.x} onChange={(e) => onObj1Change({ ...obj1, x: Number(e.target.value) })} />
				<input type="range" min="0" max="1000" value={obj1.y} onChange={(e) => onObj1Change({ ...obj1, y: Number(e.target.value) })} />
			</div>

			<div className={styles.testGroup}>
				<label>적구2 X: {obj2.x} / Y: {obj2.y}</label>
				<input type="range" min="0" max="1000" value={obj2.x} onChange={(e) => onObj2Change({ ...obj2, x: Number(e.target.value) })} />
				<input type="range" min="0" max="1000" value={obj2.y} onChange={(e) => onObj2Change({ ...obj2, y: Number(e.target.value) })} />
			</div>

			<div className={styles.testGroup}>
				<label>타격 각도: {angle}°</label>
				<input type="range" min="0" max="360" value={angle} onChange={(e) => onAngleChange(Number(e.target.value))} />
			</div>

			<div className={styles.testGroup}>
				<label>타격 강도: {power.toFixed(2)} N·s</label>
				<input type="range" min="0" max="1" step="0.01" value={power} onChange={(e) => onPowerChange(Number(e.target.value))} />
			</div>

			<div className={styles.testGroup}>
				<label>좌우 팁 오프셋: {sideSpin.toFixed(1)} mm</label>
				<input type="range" min="-30" max="30" step="1" value={sideSpin} onChange={(e) => onSideSpinChange(Number(e.target.value))} />
			</div>

			<div className={styles.testGroup}>
				<label>상하 팁 오프셋: {topBottomSpin.toFixed(1)} mm</label>
				<input type="range" min="-30" max="30" step="1" value={topBottomSpin} onChange={(e) => onTopBottomSpinChange(Number(e.target.value))} />
			</div>
		</div>
	);
};

export default TestPanel;
