import { useState, useEffect, useCallback, useRef } from "react";
import type { RefObject } from "react";
import createFrameCapture from "@/lib/capture";
import { getOpenCv } from "@/lib/opencv";
import Cuebit from "@/lib/cuebit";
import type { DebugView } from "@/lib/cuebit";
import { todo } from "@/common";
import type { PhysicsResult, Point } from "@/types/physics";
import { simulateTrajectory } from "@/lib/simulator";
import logger from "@/lib/logger";

interface TestProps {
	cue: Point;
	obj1: Point;
	obj2: Point;
	angle: number;
}

interface UseCameraOptions {
	videoCanvasRef: RefObject<HTMLCanvasElement | null>;
	debugView: DebugView;
	onFrame: (result: PhysicsResult | null) => void;
	testProps: TestProps;
}

interface UseCameraReturn {
	cvLoaded: boolean;
	errorMsg: string;
}

function useCamera({
	videoCanvasRef,
	debugView,
	onFrame,
	testProps,
}: UseCameraOptions): UseCameraReturn {
	const [cvLoaded, setCvLoaded] = useState(false);
	const [errorMsg, setErrorMsg] = useState("");

	const debugViewRef = useRef<DebugView>(debugView);
	useEffect(() => { debugViewRef.current = debugView; }, [debugView]);

	const onFrameRef = useRef(onFrame);
	useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);

	const testPropsRef = useRef<TestProps>(testProps);
	useEffect(() => { testPropsRef.current = testProps; }, [testProps]);

	const createFrameDrawer = useCallback(
		(canvas: HTMLCanvasElement, width: number, height: number) => {
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Failed to get canvas context");
			return {
				draw: (data: Uint8ClampedArray<ArrayBuffer>) => {
					context.putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0);
				},
			};
		},
		[],
	);

	useEffect(() => {
		const ac = new AbortController();
		let rAFId: number;                  // 프레임 취소 식별자
		let activeStream: MediaStream;      // 카메라 스트림 저장용

		const startCamera = async () => {
			// [DEV 모드]
			if (import.meta.env.DEV) {
				setCvLoaded(true);
				logger.info("[DEV] 카메라 없이 시뮬레이터 모드로 실행");

				const loop = () => {
					if (ac.signal.aborted) return;
					const { cue, obj1, obj2, angle } = testPropsRef.current;
					const result = simulateTrajectory(cue, angle, [obj1, obj2]);
					onFrameRef.current(result);
					rAFId = requestAnimationFrame(loop);
				};
				rAFId = requestAnimationFrame(loop);
				return;
			}

			// [PROD 모드]
			try {
				logger.info("카메라 스트림 요청 중...");
				activeStream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						// 표준 해상도(FHD)를 ideal로 주어 디바이스 환경에 맞게 유연하게 획득
						width: { ideal: 1920 },
						height: { ideal: 1080 },
						facingMode: { ideal: "environment" },
					},
				});
				logger.info("카메라 스트림 획득 완료");

				const [track] = activeStream.getVideoTracks();
				const frameCapture = await createFrameCapture(ac.signal, track);

				const buffer = new Uint8ClampedArray(frameCapture.width * frameCapture.height * 4);
				const canvas: HTMLCanvasElement = videoCanvasRef.current ?? todo("canvas가 없음");
				const drawer = createFrameDrawer(canvas, frameCapture.width, frameCapture.height);

				await getOpenCv();
				setCvLoaded(true);
				logger.info("OpenCV 초기화 완료");

				const cuebit = new Cuebit(frameCapture.width, frameCapture.height);

				await frameCapture.on(async (frame) => {
					await frame.copyTo(buffer, {
						format: "RGBA",
						layout: [{ offset: 0, stride: frameCapture.width * 4 }],
					});

					const { frames } = cuebit.process(buffer);
					drawer.draw(frames[debugViewRef.current]);

					const { cue, obj1, obj2, angle } = testPropsRef.current;
					const result = simulateTrajectory(cue, angle, [obj1, obj2]);
					onFrameRef.current(result);
				});

				cuebit.destroy();
			} catch (err) {
				logger.error({ err }, "카메라 시작 에러");
				setErrorMsg("카메라 권한을 확인해주세요.");
			}
		};

		startCamera();

		// 클린업 함수 (메모리 및 하드웨어 점유 해제)
		return () => {
			ac.abort();
			if (rAFId) cancelAnimationFrame(rAFId);
			if (activeStream) {
				activeStream.getTracks().forEach(track => track.stop()); // 카메라 불빛 꺼짐 보장
			}
		};
	}, [createFrameDrawer, videoCanvasRef]);

	return { cvLoaded, errorMsg };
}

export default useCamera;