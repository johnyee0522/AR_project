import type { MeterPoint } from "@/types/physics";
import {
	TABLE_HEIGHT_M,
	TABLE_WIDTH_M,
} from "@/lib/physics/physics_constants";
import {
	pixelToTableMeters,
	type PixelPoint,
} from "./table_coordinate";

export interface CameraDetectionResult {
	table: {
		corners: PixelPoint[];
	};
	balls: {
		id: string;
		tableX: number;
		tableY: number;
	}[];
	cue: {
		angleDeg: number;
	};
}

export interface CameraFrameInput {
	width: number;
	height: number;
	rgba?: Uint8ClampedArray;
	timestampMs?: number;
}

interface MockBallPixelRatio {
	id: string;
	x: number;
	y: number;
}

const MOCK_BALLS: MockBallPixelRatio[] = [
	{ id: "white", x: 0.2, y: 0.75 },
	{ id: "red", x: 0.5, y: 0.5 },
	{ id: "yellow", x: 0.7, y: 0.3 },
];

function createMockTableCorners(width: number, height: number): PixelPoint[] {
	const left = width * 0.12;
	const right = width * 0.88;
	const top = height * 0.18;
	const bottom = height * 0.82;

	return [
		{ x: left, y: top },
		{ x: right, y: top },
		{ x: right, y: bottom },
		{ x: left, y: bottom },
	];
}

function ratioToPixelPoint(
	ratio: MockBallPixelRatio,
	corners: readonly PixelPoint[],
): PixelPoint {
	const topLeft = corners[0];
	const topRight = corners[1];
	const bottomRight = corners[2];
	const bottomLeft = corners[3];
	const u = ratio.x;
	const v = ratio.y;

	return {
		x:
			topLeft.x * (1 - u) * (1 - v) +
			topRight.x * u * (1 - v) +
			bottomRight.x * u * v +
			bottomLeft.x * (1 - u) * v,
		y:
			topLeft.y * (1 - u) * (1 - v) +
			topRight.y * u * (1 - v) +
			bottomRight.y * u * v +
			bottomLeft.y * (1 - u) * v,
	};
}

function toCameraBall(
	ball: MockBallPixelRatio,
	corners: readonly PixelPoint[],
): CameraDetectionResult["balls"][number] | null {
	const tablePoint = pixelToTableMeters(ratioToPixelPoint(ball, corners), corners);
	if (!tablePoint) return null;

	return {
		id: ball.id,
		tableX: tablePoint.x,
		tableY: tablePoint.y,
	};
}

function fallbackTablePoint(ball: MockBallPixelRatio): MeterPoint {
	return {
		x: ball.x * TABLE_WIDTH_M,
		y: ball.y * TABLE_HEIGHT_M,
	};
}

export function createMockCameraDetectionResult(
	frame: Partial<CameraFrameInput> = {},
): CameraDetectionResult {
	const width = frame.width ?? 1280;
	const height = frame.height ?? 720;
	const corners = createMockTableCorners(width, height);
	const balls = MOCK_BALLS.map((ball) => {
		const cameraBall = toCameraBall(ball, corners);
		if (cameraBall) return cameraBall;

		const fallback = fallbackTablePoint(ball);
		return {
			id: ball.id,
			tableX: fallback.x,
			tableY: fallback.y,
		};
	});

	return {
		table: {
			corners,
		},
		balls,
		cue: {
			angleDeg: 35,
		},
	};
}

export async function detectCameraFrame(
	frame: CameraFrameInput,
): Promise<CameraDetectionResult | null> {
	// TODO: Replace this mock with table, ball, and cue model inference.
	// Detector output must stay in table meter coordinates, not raw pixels.
	return createMockCameraDetectionResult(frame);
}
