import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { device, onnx } from "@/lib/onnx";
import type { DevDetectedStateInput } from "@/lib/detection/dev_detected_state";
import { createDevDetectedState } from "@/lib/detection/dev_detected_state";
import { cuebitResultToDetectedState } from "@/lib/detection/cuebit_adapter";
import createFrameCapture from "@/lib/capture";
import Cuebit from "@/lib/cuebit";
import logger from "@/lib/logger";
import type { DetectedState } from "@/types/detection";

export type DetectionMode = "camera" | "simulator" | "rapierSimulator";

interface CameraUiInput {
  power: number;
  sideSpin: number;
  topSpin: number;
  cueBallId?: string;
}

interface UseCameraOptions {
  videoCanvasRef: RefObject<HTMLCanvasElement | null>;
  onFrame: (detected: DetectedState | null) => void;
  inputSource: DetectionMode;
  cameraUiInput: CameraUiInput;
  simulatorInput: DevDetectedStateInput;
}

interface FrameDrawer {
  draw: (frame: VideoFrame) => Promise<void>;
}

function clearVideoCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
}

function createFrameDrawer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): FrameDrawer | null {
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  canvas.width = width;
  canvas.height = height;

  const buffer = new Uint8ClampedArray(width * height * 4);

  return {
    async draw(frame) {
      await frame.copyTo(buffer, {
        format: "RGBA",
        layout: [{ offset: 0, stride: width * 4 }],
      });
      context.putImageData(new ImageData(buffer, width, height), 0, 0);
    },
  };
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useCamera({
  videoCanvasRef,
  onFrame,
  inputSource,
  cameraUiInput,
  simulatorInput,
}: UseCameraOptions) {
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onFrameRef = useRef(onFrame);
  const cameraUiInputRef = useRef(cameraUiInput);
  const simulatorInputRef = useRef(simulatorInput);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    cameraUiInputRef.current = cameraUiInput;
  }, [cameraUiInput]);

  useEffect(() => {
    simulatorInputRef.current = simulatorInput;
  }, [simulatorInput]);

  const startSimulatorSource = useCallback(() => {
    let animationFrame = 0;
    let disposed = false;

    clearVideoCanvas(videoCanvasRef.current);
    setCameraReady(true);
    setError(null);

    const tick = () => {
      if (disposed) {
        return;
      }

      onFrameRef.current(createDevDetectedState(simulatorInputRef.current));
      animationFrame = window.requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [videoCanvasRef]);

  const startCameraSource = useCallback(() => {
    const abortController = new AbortController();
    let activeStream: MediaStream | null = null;

    setCameraReady(false);
    setError(null);

    void (async () => {
      try {
        logger.info("Requesting camera stream for Cuebit detector");

        activeStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        const [track] = activeStream.getVideoTracks();

        if (!track) {
          throw new Error("No video track was returned from getUserMedia.");
        }

        const frameCapture = await createFrameCapture(abortController.signal, track);
        const cuebit = new Cuebit(device, onnx, frameCapture.frameInfo);
        const drawer = videoCanvasRef.current
          ? createFrameDrawer(
              videoCanvasRef.current,
              frameCapture.frameInfo.width,
              frameCapture.frameInfo.height,
            )
          : null;

        setCameraReady(true);

        await frameCapture.on(async (frame) => {
          await drawer?.draw(frame);

          const cuebitResult = await cuebit.process(frame);
          const currentInput = cameraUiInputRef.current;
          const detected = cuebitResultToDetectedState(cuebitResult, {
            power: currentInput.power,
            hitPoint: {
              x: currentInput.sideSpin,
              y: currentInput.topSpin,
            },
            cueBallId: currentInput.cueBallId,
          });

          onFrameRef.current(detected);
        });
      } catch (err) {
        if (abortController.signal.aborted) {
          return;
        }

        logger.error(err, "Failed to start Cuebit camera detector");
        setError("카메라 권한 또는 비전 처리 초기화에 실패했습니다.");
        setCameraReady(false);
        onFrameRef.current(null);
      }
    })();

    return () => {
      abortController.abort();
      stopStream(activeStream);
      clearVideoCanvas(videoCanvasRef.current);
      setCameraReady(false);
    };
  }, [videoCanvasRef]);

  useEffect(() => {
    if (inputSource === "simulator" || inputSource === "rapierSimulator") {
      return startSimulatorSource();
    }

    return startCameraSource();
  }, [inputSource, startCameraSource, startSimulatorSource]);

  return {
    cameraReady,
    errorMsg: error,
  };
}

export default useCamera;

