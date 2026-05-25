import type { BallPositions } from "@/types/physics";

export interface PhysicsTestShotPreset {
	id: string;
	name: string;
	angleDeg: number;
	power: number;
	sideSpin: number;
	topSpin: number;
	balls: BallPositions;
}

export const PHYSICS_TEST_SHOT_PRESETS: readonly PhysicsTestShotPreset[] = [
	{
		id: "vertical-center-3-ball",
		name: "1. 세로기준 3구",
		angleDeg: 265,
		power: 1.5,
		sideSpin: 0,
		topSpin: 0,
		balls: {
			cueBall: { x: 1.16, y: 0.72 },
			red: { x: 1.06, y: 0.27 },
			yellow: { x: 1.49, y: 0.8 },
		},
	},
	{
		id: "vertical-right-rail-3-ball",
		name: "2. 우측세로 3구",
		angleDeg: 270,
		power: 2.5,
		sideSpin: -40,
		topSpin: 0,
		balls: {
			cueBall: { x: 2.29, y: 1.05 },
			red: { x: 0.49, y: 0.48 },
			yellow: { x: 2.32, y: 0.45 },
		},
	},
	{
		id: "vertical-lower-left-3-ball",
		name: "3. 하단세로 3구",
		angleDeg: 261,
		power: 1,
		sideSpin: 0,
		topSpin: 40,
		balls: {
			cueBall: { x: 0.88, y: 1.25 },
			red: { x: 0.72, y: 0.5 },
			yellow: { x: 0.89, y: 0.91 },
		},
	},
	{
		id: "diagonal-left-2-ball",
		name: "4. 318도 3쿠션",
		angleDeg: 318,
		power: 2,
		sideSpin: 20,
		topSpin: 20,
		balls: {
			cueBall: { x: 0.42, y: 1.08 },
			red: { x: 0.0, y: 0.13 },
			yellow: { x: 0.12, y: 0.0 },
		},
	},
	{
		id: "diagonal-left-low-2-ball",
		name: "5. 314도 2구",
		angleDeg: 314,
		power: 2,
		sideSpin: 20,
		topSpin: 20,
		balls: {
			cueBall: { x: 0.72, y: 1.09 },
			red: { x: 0.38, y: 0.03 },
			yellow: { x: 0.38, y: 0.18 },
		},
	},
	{
		id: "yellow-cue-343-3-ball",
		name: "6. 노란 수구 338도",
		angleDeg: 338,
		power: 2.3,
		sideSpin: 20,
		topSpin: 20,
		balls: {
			cueBall: { x: 0.57, y: 0.98 },
			red: { x: 1.16, y: 0.8 },
			yellow: { x: 0.42, y: 0.09 },
		},
	},
	{
		id: "cluster-292-3-ball",
		name: "7. 285도 3구",
		angleDeg: 285,
		power: 2,
		sideSpin: 22,
		topSpin: 22,
		balls: {
			cueBall: { x: 1.99, y: 0.93 },
			red: { x: 1.62, y: 0.67 },
			yellow: { x: 1.78, y: 0.66 },
		},
	},
	
];
