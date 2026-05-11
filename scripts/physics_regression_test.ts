import assert from "node:assert/strict";
import {
	Simulation2D,
	detectedStateToPredictShotInput,
	predictFinalPositions,
	predictShot,
} from "../src/lib/physics";
import {
	BALL_RADIUS_M,
	TABLE_HEIGHT_M,
	TABLE_WIDTH_M,
} from "../src/lib/physics/physics_constants";
import type { PhysicsEvent, PhysicsResult, Point } from "../src/types/physics";

const EPSILON_M = 1e-6;

function getTrajectory(result: PhysicsResult, ballId: string): Point[] {
	const trajectory = result.trajectories.find((item) => item.ballId === ballId);
	assert.ok(trajectory, `${ballId} trajectory should exist`);
	return trajectory.waypoints;
}

function lastWaypoint(result: PhysicsResult, ballId: string): Point {
	const waypoints = getTrajectory(result, ballId);
	assert.ok(waypoints.length > 0, `${ballId} should have waypoints`);
	return waypoints.at(-1) as Point;
}

function firstEvent(
	result: PhysicsResult,
	type: PhysicsEvent["type"],
	ballId: string,
): PhysicsEvent | undefined {
	return result.events.find(
		(event) => event.type === type && event.ballId === ballId,
	);
}

function assertAlmostEqual(
	actual: number,
	expected: number,
	tolerance: number,
	message: string,
): void {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`${message}: expected ${expected}, got ${actual}`,
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cue: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
	});

	const result = sim.predict(0, 0.5, 120, 0, 0);
	const cueEnd = lastWaypoint(result, "cue");

	assertAlmostEqual(
		cueEnd.y,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"No-spin straight shot should not change y",
	);
	assert.equal(
		result.events.length,
		0,
		"Short shot with no collision should not emit events",
	);
	assertAlmostEqual(
		result.summary.finalPositions["cue"]?.y ?? Number.NaN,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"finalPositions should include final cue y",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cue: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
	});

	const result = sim.predict(0, 0, 1200, 100, 100);
	const cueEnd = lastWaypoint(result, "cue");

	assert.equal(
		result.summary.stepCount,
		1,
		"Stationary spin should be settled immediately",
	);
	assertAlmostEqual(
		cueEnd.x,
		0.6,
		EPSILON_M,
		"Zero-power spin input should not move the cue ball",
	);
	assertAlmostEqual(
		cueEnd.y,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"Zero-power spin input should not move the cue ball sideways",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cue: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
	});

	const result = sim.predict(
		Number.NaN,
		Number.NaN,
		Number.NaN,
		Number.NaN,
		Number.NaN,
	);
	const cueEnd = lastWaypoint(result, "cue");

	assert.ok(result.summary.stopped, "Invalid prediction input should stop safely");
	assertAlmostEqual(
		cueEnd.x,
		0.6,
		EPSILON_M,
		"Invalid prediction input should not create NaN x movement",
	);
	assertAlmostEqual(
		cueEnd.y,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"Invalid prediction input should not create NaN y movement",
	);
}

{
	const makeTravel = (topSpin: number): number => {
		const sim = new Simulation2D();
		sim.updateBallPositionsMeters({
			cue: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
		});
		const result = sim.predict(0, 0.8, 2400, 0, topSpin);
		return result.summary.travelDistanceByBall["cue"] ?? 0;
	};

	const drawTravel = makeTravel(-100);
	const noSpinTravel = makeTravel(0);
	const followTravel = makeTravel(100);

	assert.ok(
		drawTravel < noSpinTravel - 0.03,
		"Draw spin should shorten pre-collision travel",
	);
	assert.ok(
		followTravel > noSpinTravel + 0.03,
		"Follow spin should extend pre-collision travel",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cue: { x: TABLE_WIDTH_M - 0.45, y: TABLE_HEIGHT_M / 2 },
	});

	const result = sim.predict(0, 1.4, 900, 0, 0);
	const cueEnd = lastWaypoint(result, "cue");
	const event = firstEvent(result, "cushion-hit", "cue");

	assert.equal(event?.cushionSide, "right");
	assertAlmostEqual(
		cueEnd.y,
		TABLE_HEIGHT_M / 2,
		EPSILON_M,
		"No-spin vertical cushion hit should preserve tangent y",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cue: { x: TABLE_WIDTH_M / 2, y: TABLE_HEIGHT_M - 0.35 },
	});

	const result = sim.predict(90, 1.1, 900, 0, 0);
	const cueEnd = lastWaypoint(result, "cue");
	const event = firstEvent(result, "cushion-hit", "cue");

	assert.equal(event?.cushionSide, "bottom");
	assertAlmostEqual(
		cueEnd.x,
		TABLE_WIDTH_M / 2,
		EPSILON_M,
		"No-spin horizontal cushion hit should preserve tangent x",
	);
}

{
	const sim = new Simulation2D();
	sim.updateBallPositionsMeters({
		cue: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
		red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
	});

	const result = sim.predict(0, 1.0, 900, 0, 0);
	const firstHit = firstEvent(result, "ball-collision", "cue");
	const redEnd = lastWaypoint(result, "red");

	assert.equal(firstHit?.otherBallId, "red");
	assert.ok(
		redEnd.x > 1.15 + BALL_RADIUS_M,
		"Object ball should move forward after head-on collision",
	);
	assertAlmostEqual(
		redEnd.y,
		TABLE_HEIGHT_M / 2,
		1e-5,
		"No-spin head-on collision should not move object ball sideways",
	);
}

{
	const makeResult = (topSpin: number): PhysicsResult => {
		const sim = new Simulation2D();
		sim.updateBallPositionsMeters({
			cue: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
		});
		return sim.predict(0, 1.2, 1200, 0, topSpin);
	};

	const noSpinCueEnd = lastWaypoint(makeResult(0), "cue");
	const drawCueEnd = lastWaypoint(makeResult(-100), "cue");

	assert.ok(
		drawCueEnd.x < noSpinCueEnd.x - 0.05,
		"Draw spin should pull cue ball backward after a head-on collision",
	);
}

{
	const makeCueEnd = (maxSpinCorrectionSpeed: number): Point => {
		const sim = new Simulation2D({ maxSpinCorrectionSpeed });
		sim.updateBallPositionsMeters({
			cue: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
		});
		return lastWaypoint(sim.predict(0, 1.5, 1200, 0, -120), "cue");
	};

	const limitedDrawEnd = makeCueEnd(0.05);
	const normalDrawEnd = makeCueEnd(0.45);

	assert.ok(
		normalDrawEnd.x < limitedDrawEnd.x - 0.02,
		"maxSpinCorrectionSpeed should limit excessive draw correction",
	);
}

{
	const makeRedEnd = (cutThrowTransfer: number): Point => {
		const sim = new Simulation2D({ cutThrowTransfer });
		sim.updateBallPositionsMeters({
			cue: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 + BALL_RADIUS_M },
		});
		return lastWaypoint(sim.predict(0, 1.0, 900, 0, 0), "red");
	};

	const noThrowRedEnd = makeRedEnd(0);
	const throwRedEnd = makeRedEnd(0.035);

	assert.ok(
		Math.abs(throwRedEnd.y - noThrowRedEnd.y) > 0.001,
		"Cut throw should slightly change object ball angle on cut shots",
	);
}

{
	const makeResult = (offsetSide: number): PhysicsResult => {
		const sim = new Simulation2D();
		sim.updateBallPositionsMeters({
			cue: { x: TABLE_WIDTH_M - 0.5, y: TABLE_HEIGHT_M / 2 },
		});
		return sim.predict(0, 1.5, 900, offsetSide, 0);
	};

	const leftSpinEnd = lastWaypoint(makeResult(-60), "cue");
	const rightSpinEnd = lastWaypoint(makeResult(60), "cue");

	assert.ok(
		Math.abs(leftSpinEnd.y - rightSpinEnd.y) > 0.02,
		"Left/right spin should create distinguishable y deflection after cushion",
	);
}

{
	const result = predictShot({
		balls: {
			cue: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
		},
		angle: 0,
		power: 1,
		maxSteps: 900,
	});

	assert.equal(
		result.summary.firstHitBallId,
		"red",
		"predictShot should accept one-shot physics input",
	);
}

{
	const finalPositions = predictFinalPositions({
		balls: {
			cue: { x: 0.6, y: TABLE_HEIGHT_M / 2 },
			red: { x: 1.15, y: TABLE_HEIGHT_M / 2 },
		},
		angle: 0,
		power: 1,
		maxSteps: 900,
	});

	assert.ok(
		finalPositions.red.x > 1.15,
		"predictFinalPositions should expose final ball positions directly",
	);
}

{
	const input = detectedStateToPredictShotInput({
		cue: {
			angleDeg: 0,
			power: 1,
			hitPoint: { x: 0.5, y: -0.25 },
		},
		shot: {
			cueBallId: "white",
		},
		balls: [
			{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 },
			{ id: "red", x: 1.15, y: TABLE_HEIGHT_M / 2 },
		],
	});

	assert.deepEqual(input.balls["cue"], { x: 0.6, y: TABLE_HEIGHT_M / 2 });
	assert.equal(input.balls["white"], undefined);
	assert.equal(input.sideSpin, 50);
	assert.equal(input.topSpin, -25);
}

{
	const input = detectedStateToPredictShotInput(
		{
			cue: {
				angleDeg: -10,
				power: Number.NaN,
				hitPoint: { x: Number.NaN, y: Number.NaN },
			},
			shot: {
				cueBallId: "white",
			},
			balls: [{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 }],
		},
		Number.NaN,
	);

	assert.equal(input.angle, 350);
	assert.equal(input.power, 0);
	assert.equal(input.sideSpin, 0);
	assert.equal(input.topSpin, 0);
	assert.equal(input.maxSteps, 2400);

	const fractionalStepInput = detectedStateToPredictShotInput(
		{
			cue: {
				angleDeg: 0,
				power: 1,
				hitPoint: { x: 0, y: 0 },
			},
			shot: {
				cueBallId: "white",
			},
			balls: [{ id: "white", x: 0.6, y: TABLE_HEIGHT_M / 2 }],
		},
		0.5,
	);

	assert.equal(fractionalStepInput.maxSteps, 1);
}

console.log("physics regression tests passed");
