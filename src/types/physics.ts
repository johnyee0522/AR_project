/**
 * 물리 엔진 결과값 타입 정의
 */

/** 2D 좌표 (탑뷰 좌표계 기준, 단위: 0~1000) */
export interface Point {
	x: number;
	y: number;
}

/** 공 한 개의 예측 이동 경로 */
export interface BallTrajectory {
	/** 공 ID ("cue" | "red" | "yellow") */
	ballId: string;
	/**
	 * 경로의 꺾이는 지점 좌표 배열
	 * 시작점 → 쿠션/충돌 지점 → 최종 멈춤 위치 순서로
	 * 이 점들을 순서대로 직선으로 이으면 예측 궤적선이 됨
	 */
	waypoints: Point[];
}

/** 물리 엔진 최종 반환값 */
export interface PhysicsResult {
	trajectories: BallTrajectory[];
}