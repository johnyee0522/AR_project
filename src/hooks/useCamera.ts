import { useState, useEffect, useCallback, RefObject } from "react";
import createFrameCapture from "@/lib/capture";
import { getOpenCv } from "@/lib/opencv";
import Cuebit from "@/lib/cuebit";
import { todo } from "@/common";

export interface BallPos {
    x: number;
    y: number;
}

interface UseCameraOptions {
    videoCanvasRef: RefObject<HTMLCanvasElement | null>;
    onFrame: (ballPos: BallPos | null) => void;
}

interface UseCameraReturn {
    cvLoaded: boolean;
    errorMsg: string;
}

/**
 * 카메라 스트림을 열고, 매 프레임마다 OpenCV로 공 위치를 감지한 뒤
 * onFrame 콜백으로 결과를 전달하는 훅.
 *
 * 컴포넌트가 언마운트되면 카메라도 자동으로 꺼짐.
 */
function useCamera({ videoCanvasRef, onFrame }: UseCameraOptions): UseCameraReturn {
    const [cvLoaded, setCvLoaded] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

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
                    context.putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0);
                },
            };
        },
        [],
    );

    useEffect(() => {
        const ac = new AbortController();

        const startCamera = async () => {
            try {
                // 1. 카메라 스트림 열기
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        width: 1000,
                        height: 1000,
                        facingMode: { ideal: "environment" },
                    },
                });

                const [track] = stream.getVideoTracks();
                const frameCapture = await createFrameCapture(ac.signal, track);
                const buffer = new Uint8ClampedArray(
                    frameCapture.width * frameCapture.height * 4,
                );

                // 2. 비디오 캔버스 드로어 생성
                const canvas: HTMLCanvasElement =
                    videoCanvasRef.current ?? todo("canvas가 없음");
                const drawer = createFrameDrawer(
                    canvas,
                    frameCapture.width,
                    frameCapture.height,
                );

                // 3. OpenCV 초기화
                await getOpenCv();
                setCvLoaded(true);

                // 4. Cuebit(공 감지 엔진) 생성
                const cuebit = new Cuebit(frameCapture.width, frameCapture.height);

                // 5. 프레임 루프 시작
                await frameCapture.on(async (frame) => {
                    await frame.copyTo(buffer, {
                        format: "RGBA",
                        layout: [{ offset: 0, stride: frameCapture.width * 4 }],
                    });

                    const { frameBuffer, ballPos } = cuebit.process(buffer);

                    // 화면에 프레임 그리기
                    drawer.draw(frameBuffer);

                    // 부모(Main)에게 공 위치 전달
                    onFrame(ballPos);
                });
            } catch (err) {
                console.error("카메라 시작 에러:", err);
                setErrorMsg(
                    "카메라 또는 AI 엔진을 켜지 못했습니다. HTTPS 배포 환경에서 테스트해주세요.",
                );
            }
        };

        startCamera();

        // 컴포넌트 언마운트 시 카메라 종료
        return () => {
            ac.abort();
        };
    }, [createFrameDrawer, videoCanvasRef, onFrame]);

    return { cvLoaded, errorMsg };
}

export default useCamera;
