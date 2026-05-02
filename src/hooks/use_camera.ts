import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import createFrameCapture from "@/lib/capture";
import logger from "@/lib/logger";
import type { Point } from "@/types/physics";

export interface DetectedState {
	balls: {
		cue: Point;
		red: Point;
		yellow: Point;
	};
	angle: number;
}

interface UseCameraOptions {
	videoCanvasRef: RefObject<HTMLCanvasElement | null>;
	onFrame: (detected: DetectedState | null) => void;
	testProps: {
		cue: Point;
		obj1: Point;
		obj2: Point;
		angle: number;
	};
}

interface UseCameraReturn {
	cameraReady: boolean;
	errorMsg: string;
}

function useCamera({
	videoCanvasRef,
	onFrame,
	testProps,
}: UseCameraOptions): UseCameraReturn {
	const [cameraReady, setCameraReady] = useState(false);
	const [errorMsg, setErrorMsg] = useState("");

	const onFrameRef = useRef(onFrame);
	useEffect(() => {
		onFrameRef.current = onFrame;
	}, [onFrame]);

	const testPropsRef = useRef(testProps);
	useEffect(() => {
		testPropsRef.current = testProps;
	}, [testProps]);

	const createFrameDrawer = useCallback(
		(canvas: HTMLCanvasElement, width: number, height: number) => {
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Failed to get canvas context");

			return {
				draw: (data: Uint8ClampedArray<ArrayBuffer>) => {
					context.putImageData(new ImageData(data, width, height), 0, 0);
				},
			};
		},
		[],
	);

	useEffect(() => {
		const ac = new AbortController();
		let rAFId: number | undefined;
		let activeStream: MediaStream | undefined;

		const startCamera = async () => {
			if (import.meta.env.DEV) {
				setCameraReady(true);
				logger.info("[DEV] Running simulation mode without camera detection");

				const loop = () => {
					if (ac.signal.aborted) return;
					onFrameRef.current({
						balls: {
							cue: testPropsRef.current.cue,
							red: testPropsRef.current.obj1,
							yellow: testPropsRef.current.obj2,
						},
						angle: testPropsRef.current.angle,
					});
					rAFId = requestAnimationFrame(loop);
				};
				rAFId = requestAnimationFrame(loop);
				return;
			}

			try {
				logger.info("Requesting camera stream");
				activeStream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						width: { ideal: 1920 },
						height: { ideal: 1080 },
						facingMode: { ideal: "environment" },
					},
				});

				const [track] = activeStream.getVideoTracks();
				const frameCapture = await createFrameCapture(ac.signal, track);
				const buffer = new Uint8ClampedArray(
					frameCapture.width * frameCapture.height * 4,
				);
				const canvas = videoCanvasRef.current;
				if (!canvas) throw new Error("Video canvas not found");

				const drawer = createFrameDrawer(
					canvas,
					frameCapture.width,
					frameCapture.height,
				);
				setCameraReady(true);

				await frameCapture.on(async (frame) => {
					await frame.copyTo(buffer, {
						format: "RGBA",
						layout: [{ offset: 0, stride: frameCapture.width * 4 }],
					});
					drawer.draw(buffer);
					onFrameRef.current(null);
				});
			} catch (err) {
				logger.error({ err }, "Failed to start camera");
				setErrorMsg(
					"\uce74\uba54\ub77c \uad8c\ud55c\uc744 \ud655\uc778\ud574\uc8fc\uc138\uc694.",
				);
			}
		};

		startCamera();

		return () => {
			ac.abort();
			if (rAFId !== undefined) cancelAnimationFrame(rAFId);
			activeStream?.getTracks().forEach((track) => track.stop());
		};
	}, [createFrameDrawer, videoCanvasRef]);

	return { cameraReady, errorMsg };
}

export default useCamera;
