import type { Ref } from "react";
import styles from "./minimap.module.css";

interface MinimapProps {
	/** 미니맵 표시 여부 */
	visible: boolean;
	/** 미니맵 캔버스 ref */
	ref?: Ref<HTMLCanvasElement>;
}

/**
 * 정규화된 공 위치를 표시하는 우측 상단 미니맵 패널
 */
function Minimap({ visible, ref }: MinimapProps) {
	return (
		<div
			className={`${styles.container} ${visible ? styles.visible : styles.dim}`}
		>
			<p className={styles.label}>MINIMAP</p>
			<canvas ref={ref} width={70} height={120} className={styles.canvas} />
		</div>
	);
}

export default Minimap;
