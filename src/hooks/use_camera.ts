import { useState, useEffect, useCallback, useRef } from "react";
import type { RefObject } from "react";
import createFrameCapture from "@/lib/capture";
import { getOpenCv } from "@/lib/opencv";
import Cuebit from "@/lib/cuebit";
import type { DebugView } from "@/lib/cuebit";
import { todo } from "@/common";
import type { Point } from "@/types/physics";
import logger from "@/lib/logger";

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
	debugView: DebugView;
	/** 감지된 공 위치를 포함한 프레임 처리 콜백 */
	onFrame: (detected: DetectedState | null) => void;
	/** 개발 및 테스트 모드용 기본 위치값 */
	testProps: {
		cue: Point;
		obj1: Point;
		obj2: Point;
		angle: number;
	};
}

interface UseCameraReturn {
	cvLoaded: boolean;
	errorMsg: string;
}

/**
 * 카메라 스트림 관리 및 공 감지 프로세싱을 담당하는 훅
 */
function useCamera({
	videoCanvasRef,
	debugView,
	onFrame,
	testProps,
}: UseCameraOptions): UseCameraReturn {
	const [cvLoaded, setCvLoaded] = useState(false);
	const [errorMsg, setErrorMsg] = useState("");

	const debugViewRef = useRef<DebugView>(debugView);
	useEffect(() => {
		debugViewRef.current = debugView;
	}, [debugView]);

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
					context.putImageData(
						new ImageData(data, canvas.width, canvas.height),
						0,
						0,
					);
				},
			};
		},
		[],
	);

	useEffect(() => {
		const ac = new AbortController();
		let rAFId: number;
		let activeStream: MediaStream;

		const startCamera = async () => {
			// 개발 환경에서는 실제 카메라 없이 시뮬레이터 모드로 실행
			if (import.meta.env.DEV) {
				setCvLoaded(true);
				logger.info("[DEV] 카메라 없이 시뮬레이터 모드로 실행 중");

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
				logger.info("카메라 스트림 요청 중...");
				activeStream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						width: { ideal: 1920 },
						height: { ideal: 1080 },
						facingMode: { ideal: "environment" },
					},
				});
				logger.info("카메라 스트림 획득 완료");

				const [track] = activeStream.getVideoTracks();
				const frameCapture = await createFrameCapture(ac.signal, track);

				const buffer = new Uint8ClampedArray(
					frameCapture.width * frameCapture.height * 4,
				);
				const canvas: HTMLCanvasElement =
					videoCanvasRef.current ?? todo("Canvas를 찾을 수 없음");
				const drawer = createFrameDrawer(
					canvas,
					frameCapture.width,
					frameCapture.height,
				);

				await getOpenCv();
				setCvLoaded(true);
				logger.info("OpenCV 초기화 완료");

				const cuebit = new Cuebit(frameCapture.width, frameCapture.height);

				await frameCapture.on(async (frame) => {
					await frame.copyTo(buffer, {
						format: "RGBA",
						layout: [{ offset: 0, stride: frameCapture.width * 4 }],
					});

					const { frames, detected } = cuebit.process(buffer);
					drawer.draw(frames[debugViewRef.current]);

					// 공 3개가 모두 감지되었을 때만 데이터 전달
					if (detected.cue && detected.obj1 && detected.obj2) {
						onFrameRef.current({
							balls: {
								cue: detected.cue,
								red: detected.obj1,
								yellow: detected.obj2,
							},
							angle: detected.angle,
						});
					} else {
						onFrameRef.current(null);
					}
				});

				cuebit.destroy();
			} catch (err) {
				logger.error({ err }, "카메라 시작 에러");
				setErrorMsg("카메라 권한을 확인해주세요.");
			}
		};

		startCamera();

		return () => {
			ac.abort();
			if (rAFId) cancelAnimationFrame(rAFId);
			if (activeStream) {
				activeStream.getTracks().forEach((track) => track.stop());
			}
		};
	}, [createFrameDrawer, videoCanvasRef]);

	return { cvLoaded, errorMsg };
}

export default useCamera;
