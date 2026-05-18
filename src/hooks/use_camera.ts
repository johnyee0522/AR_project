import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import createFrameCapture from "@/lib/capture";
import {
	createCameraDetectedState,
	type CameraDetectedStateUiInput,
} from "@/lib/detection/camera_detected_state";
import {
	createMockCameraDetectionResult,
	detectCameraFrame,
	type CameraDetectionResult,
} from "@/lib/detection/camera_detector";
import {
	createDevDetectedState,
	type DevDetectedStateInput,
} from "@/lib/detection/dev_detected_state";
import logger from "@/lib/logger";
import type { DetectedState } from "@/types/detection";

export type DetectionMode = "camera" | "simulator";

interface UseCameraOptions {
	videoCanvasRef: RefObject<HTMLCanvasElement | null>;
	onFrame: (detected: DetectedState | null) => void;
	inputSource: DetectionMode;
	cameraUiInput: CameraDetectedStateUiInput;
	simulatorInput: DevDetectedStateInput;
}

interface UseCameraReturn {
	cameraReady: boolean;
	errorMsg: string;
}

function devLog(message: string, data?: unknown): void {
	if (import.meta.env.DEV) {
		logger.debug(data ?? {}, message);
	}
}

function getCanvasFrameSize(canvas: HTMLCanvasElement): {
	width: number;
	height: number;
} | null {
	const rect = canvas.getBoundingClientRect();
	const devicePixelRatio = window.devicePixelRatio || 1;
	const width = rect.width || window.innerWidth;
	const height = rect.height || window.innerHeight;

	if (width <= 0 || height <= 0) return null;

	return {
		width: Math.max(1, Math.round(width * devicePixelRatio)),
		height: Math.max(1, Math.round(height * devicePixelRatio)),
	};
}

function clearVideoCanvas(canvas: HTMLCanvasElement) {
	const frameSize = getCanvasFrameSize(canvas);
	if (!frameSize) {
		devLog("camera frame skipped because canvas size is zero");
		return false;
	}
	const { width, height } = frameSize;
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
		devLog("video canvas resized", { width, height });
	}

	const context = canvas.getContext("2d");
	if (!context) return false;

	context.clearRect(0, 0, width, height);
	return true;
}

function useCamera({
	videoCanvasRef,
	onFrame,
	inputSource,
	cameraUiInput,
	simulatorInput,
}: UseCameraOptions): UseCameraReturn {
	const [cameraReady, setCameraReady] = useState(false);
	const [errorMsg, setErrorMsg] = useState("");

	const onFrameRef = useRef(onFrame);
	useEffect(() => {
		onFrameRef.current = onFrame;
	}, [onFrame]);

	const cameraUiInputRef = useRef(cameraUiInput);
	useEffect(() => {
		cameraUiInputRef.current = cameraUiInput;
	}, [cameraUiInput]);

	const simulatorInputRef = useRef(simulatorInput);
	useEffect(() => {
		simulatorInputRef.current = simulatorInput;
	}, [simulatorInput]);

	const createFrameDrawer = useCallback(
		(canvas: HTMLCanvasElement) => {
			return {
				draw: async (
					data: Uint8ClampedArray<ArrayBuffer>,
					sourceWidth: number,
					sourceHeight: number,
				) => {
					const frameSize = getCanvasFrameSize(canvas);
					if (!frameSize) {
						devLog("camera frame skipped because canvas size is zero");
						return false;
					}

					const { width, height } = frameSize;
					if (canvas.width !== width || canvas.height !== height) {
						canvas.width = width;
						canvas.height = height;
						devLog("video canvas resized", { width, height });
					}

					const context = canvas.getContext("2d");
					if (!context) return false;

					let bitmap: ImageBitmap | null = null;
					try {
						const imageData = new ImageData(data, sourceWidth, sourceHeight);
						if (typeof createImageBitmap === "function") {
							bitmap = await createImageBitmap(imageData);
							context.drawImage(bitmap, 0, 0, width, height);
						} else {
							const frameCanvas = document.createElement("canvas");
							frameCanvas.width = sourceWidth;
							frameCanvas.height = sourceHeight;
							const frameContext = frameCanvas.getContext("2d");
							if (!frameContext) return false;
							frameContext.putImageData(imageData, 0, 0);
							context.drawImage(frameCanvas, 0, 0, width, height);
						}
						return true;
					} catch (err) {
						devLog("camera frame draw failed", { err });
						return false;
					} finally {
						bitmap?.close();
					}
				},
			};
		},
		[],
	);

	useEffect(() => {
		const ac = new AbortController();
		let rAFId: number | undefined;
		let activeStream: MediaStream | undefined;

		setCameraReady(false);
		setErrorMsg("");

		const emitCameraResult = (cameraResult: CameraDetectionResult | null) => {
			onFrameRef.current(
				cameraResult
					? createCameraDetectedState(cameraResult, cameraUiInputRef.current)
					: null,
			);
		};

		const startSimulatorSource = () => {
			setCameraReady(true);
			logger.info("Running simulator input source");
			if (videoCanvasRef.current) {
				clearVideoCanvas(videoCanvasRef.current);
			}

			const loop = () => {
				if (ac.signal.aborted) return;
				onFrameRef.current(createDevDetectedState(simulatorInputRef.current));
				rAFId = requestAnimationFrame(loop);
			};
			rAFId = requestAnimationFrame(loop);
		};

		const startMockCameraSource = () => {
			setCameraReady(true);
			logger.info("[DEV] Running mock camera input source");

			const loop = () => {
				if (ac.signal.aborted) return;

				const canvas = videoCanvasRef.current;
				const frameSize = canvas ? getCanvasFrameSize(canvas) : null;
				const cameraResult = createMockCameraDetectionResult(frameSize ?? undefined);
				if (canvas) clearVideoCanvas(canvas);
				emitCameraResult(cameraResult);
				rAFId = requestAnimationFrame(loop);
			};
			rAFId = requestAnimationFrame(loop);
		};

		const startCameraSource = async () => {
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
				if (ac.signal.aborted) return;

				const [track] = activeStream.getVideoTracks();
				const frameCapture = await createFrameCapture(ac.signal, track);
				if (ac.signal.aborted) return;

				const buffer = new Uint8ClampedArray(
					frameCapture.width * frameCapture.height * 4,
				);
				const canvas = videoCanvasRef.current;
				if (!canvas) throw new Error("Video canvas not found");

				const drawer = createFrameDrawer(canvas);
				setCameraReady(true);

				await frameCapture.on(async (frame) => {
					try {
						const frameWidth = frame.codedWidth || frameCapture.width;
						const frameHeight = frame.codedHeight || frameCapture.height;
						const requiredLength = frameWidth * frameHeight * 4;
						const frameBuffer =
							buffer.length === requiredLength
								? buffer
								: new Uint8ClampedArray(requiredLength);

						await frame.copyTo(frameBuffer, {
							format: "RGBA",
							layout: [{ offset: 0, stride: frameWidth * 4 }],
						});
						await drawer.draw(frameBuffer, frameWidth, frameHeight);

						const cameraResult = await detectCameraFrame({
							width: frameWidth,
							height: frameHeight,
							rgba: frameBuffer,
							timestampMs: frame.timestamp / 1000,
						});
						emitCameraResult(cameraResult);
					} catch (err) {
						devLog("camera frame skipped after processing error", { err });
					}
				});
			} catch (err) {
				if (ac.signal.aborted) return;

				logger.error({ err }, "Failed to start camera");
				setCameraReady(false);
				setErrorMsg(
					"\uce74\uba54\ub77c \uad8c\ud55c\uc744 \ud655\uc778\ud574\uc8fc\uc138\uc694.",
				);
			}
		};

		if (inputSource === "simulator") {
			startSimulatorSource();
		} else if (import.meta.env.DEV) {
			startMockCameraSource();
		} else {
			startCameraSource();
		}

		return () => {
			ac.abort();
			if (rAFId !== undefined) cancelAnimationFrame(rAFId);
			activeStream?.getTracks().forEach((track) => track.stop());
		};
	}, [createFrameDrawer, inputSource, videoCanvasRef]);

	useEffect(() => {
		const handleViewportChange = () => {
			devLog("viewport resized", {
				innerWidth: window.innerWidth,
				innerHeight: window.innerHeight,
				devicePixelRatio: window.devicePixelRatio,
			});
			const canvas = videoCanvasRef.current;
			if (canvas) clearVideoCanvas(canvas);
		};
		const handleOrientationChange = () => {
			devLog("orientation changed");
			window.requestAnimationFrame(handleViewportChange);
		};

		window.addEventListener("resize", handleViewportChange);
		window.addEventListener("orientationchange", handleOrientationChange);
		return () => {
			window.removeEventListener("resize", handleViewportChange);
			window.removeEventListener("orientationchange", handleOrientationChange);
		};
	}, [videoCanvasRef]);

	return { cameraReady, errorMsg };
}

export default useCamera;
