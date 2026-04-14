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

// ✨ Main에서 넘어오는 테스트 데이터 규격
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
    testProps: TestProps; // ✨ 옵션에 추가됨
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
    useEffect(() => {
        debugViewRef.current = debugView;
    }, [debugView]);

    const onFrameRef = useRef(onFrame);
    useEffect(() => {
        onFrameRef.current = onFrame;
    }, [onFrame]);

    // ✨ 슬라이더를 움직일 때마다 카메라가 재시작되지 않도록 Ref로 상태값 유지
    const testPropsRef = useRef<TestProps>(testProps);
    useEffect(() => {
        testPropsRef.current = testProps;
    }, [testProps]);

    const createFrameDrawer = useCallback(
        (canvas: HTMLCanvasElement, width: number, height: number) => {
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error("Failed to get canvas context");
            }
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

        const startCamera = async () => {
            try {
                logger.info("카메라 스트림 요청 중...");
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        width: 1000,
                        height: 1000,
                        facingMode: { ideal: "environment" },
                    },
                });
                logger.info("카메라 스트림 획득 완료");

                const [track] = stream.getVideoTracks();
                const frameCapture = await createFrameCapture(ac.signal, track);

                const buffer = new Uint8ClampedArray(
                    frameCapture.width * frameCapture.height * 4,
                );

                const canvas: HTMLCanvasElement =
                    videoCanvasRef.current ?? todo("canvas가 없음");
                const drawer = createFrameDrawer(
                    canvas,
                    frameCapture.width,
                    frameCapture.height,
                );

                await getOpenCv();
                setCvLoaded(true);

                const cuebit = new Cuebit(frameCapture.width, frameCapture.height);

                await frameCapture.on(async (frame) => {
                    await frame.copyTo(buffer, {
                        format: "RGBA",
                        layout: [{ offset: 0, stride: frameCapture.width * 4 }],
                    });

                    const { frames } = cuebit.process(buffer);
                    drawer.draw(frames[debugViewRef.current]);

                    // ✨ 최신 슬라이더 값을 가져옴
                    const currentTestProps = testPropsRef.current;
                    
                    // ✨ 시뮬레이터 호출 (수구위치, 타격각도, [적구1위치, 적구2위치])
                    const result = simulateTrajectory(
                        currentTestProps.cue,
                        currentTestProps.angle,
                        [currentTestProps.obj1, currentTestProps.obj2]
                    );

                    onFrameRef.current(result);
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
        };
    }, [createFrameDrawer, videoCanvasRef]);

    return { cvLoaded, errorMsg };
}

export default useCamera;