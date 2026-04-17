import type { DebugView } from "@/lib/cuebit";
import styles from "./debug_view_toggle.module.css";

interface DebugViewToggleProps {
	/** 현재 선택된 디버그 뷰 */
	current: DebugView;
	/** 뷰 변경 핸들러 */
	onChange: (view: DebugView) => void;
}

const VIEWS: { id: DebugView; label: string }[] = [
	{ id: "original", label: "원본" },
	{ id: "hsv", label: "HSV" },
	{ id: "mask", label: "마스크" },
	{ id: "contour", label: "컨투어" },
];

/**
 * 컴퓨터 비전 처리 단계별 디버그 뷰 전환 토글
 */
function DebugViewToggle({ current, onChange }: DebugViewToggleProps) {
	return (
		<div className={styles.container}>
			<span className={styles.label}>DEBUG</span>
			<div className={styles.track}>
				{VIEWS.map(({ id, label }) => (
					<button
						key={id}
						className={`${styles.option} ${current === id ? styles.active : ""}`}
						onClick={() => onChange(id)}
					>
						{label}
					</button>
				))}
			</div>
		</div>
	);
}

export default DebugViewToggle;
