import React from "react";
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
	onCueChange: (pos: BallPos) => void;
	onObj1Change: (pos: BallPos) => void;
	onObj2Change: (pos: BallPos) => void;
	onAngleChange: (angle: number) => void;
	onPowerChange: (power: number) => void;
	onClose: () => void;
}

/**
 * 테스트 모드에서 공의 위치와 물리 파라미터를 수동으로 조절하는 UI 패널
 */
const TestPanel: React.FC<TestPanelProps> = ({
	cue,
	obj1,
	obj2,
	angle,
	power,
	onCueChange,
	onObj1Change,
	onObj2Change,
	onAngleChange,
	onPowerChange,
	onClose,
}) => {
	return (
		<div className={styles.testPanel}>
			<div className={styles.testPanelHeader}>
				<h3>테스트 컨트롤러</h3>
				<button onClick={onClose}>×</button>
			</div>

			{/* 수구 위치 설정 */}
			<div className={styles.testGroup}>
				<label>수구 X: {cue.x}</label>
				<input
					type="range"
					min="0"
					max="1000"
					value={cue.x}
					onChange={(e) => onCueChange({ ...cue, x: Number(e.target.value) })}
				/>
				<label>수구 Y: {cue.y}</label>
				<input
					type="range"
					min="0"
					max="1000"
					value={cue.y}
					onChange={(e) => onCueChange({ ...cue, y: Number(e.target.value) })}
				/>
			</div>

			{/* 빨간 공 위치 설정 */}
			<div className={styles.testGroup}>
				<label>빨간 공 X: {obj1.x}</label>
				<input
					type="range"
					min="0"
					max="1000"
					value={obj1.x}
					onChange={(e) => onObj1Change({ ...obj1, x: Number(e.target.value) })}
				/>
				<label>빨간 공 Y: {obj1.y}</label>
				<input
					type="range"
					min="0"
					max="1000"
					value={obj1.y}
					onChange={(e) => onObj1Change({ ...obj1, y: Number(e.target.value) })}
				/>
			</div>

			{/* 노란 공 위치 설정 */}
			<div className={styles.testGroup}>
				<label>노란 공 X: {obj2.x}</label>
				<input
					type="range"
					min="0"
					max="1000"
					value={obj2.x}
					onChange={(e) => onObj2Change({ ...obj2, x: Number(e.target.value) })}
				/>
				<label>노란 공 Y: {obj2.y}</label>
				<input
					type="range"
					min="0"
					max="1000"
					value={obj2.y}
					onChange={(e) => onObj2Change({ ...obj2, y: Number(e.target.value) })}
				/>
			</div>

			{/* 타격 파라미터 설정 */}
			<div className={styles.testGroup}>
				<label>타격 각도: {angle}°</label>
				<input
					type="range"
					min="0"
					max="360"
					value={angle}
					onChange={(e) => onAngleChange(Number(e.target.value))}
				/>
			</div>
			<div className={styles.testGroup}>
				<label>타격 세기: {power.toFixed(1)}</label>
				<input
					type="range"
					min="0"
					max="3"
					step="0.1"
					value={power}
					onChange={(e) => onPowerChange(Number(e.target.value))}
				/>
			</div>
		</div>
	);
};

export default TestPanel;
