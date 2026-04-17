import type { Mat } from "@techstark/opencv-js";
import { getOpenCv } from "../opencv";

const { cv } = await getOpenCv();

/** 카메라 프로세싱을 위한 디버그 뷰 종류 */
export type DebugView = "original" | "hsv" | "mask" | "contour";

/** 이미지 처리 결과 인터페이스 (디버그 프레임 및 감지된 좌표) */
export interface CuebitResult {
	/** 각 디버그 뷰의 RGBA 이미지 데이터 */
	frames: Record<DebugView, Uint8ClampedArray<ArrayBuffer>>;
	/** 정규화 좌표계(0-1000)로 변환된 공 위치 */
	detected: {
		cue: { x: number; y: number } | null;
		obj1: { x: number; y: number } | null;
		obj2: { x: number; y: number } | null;
		angle: number;
	};
}

/**
 * OpenCV를 이용한 이미지 프로세싱 및 공 감지 클래스
 */
class Cuebit {
	private mat: Mat;
	private hsv: Mat;
	private mask: Mat;
	private contourOutput: Mat;

	private width: number;
	private height: number;

	private frameOriginal: Uint8ClampedArray<ArrayBuffer>;
	private frameHsv: Uint8ClampedArray<ArrayBuffer>;
	private frameMask: Uint8ClampedArray<ArrayBuffer>;
	private frameContour: Uint8ClampedArray<ArrayBuffer>;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.mat = new cv.Mat(height, width, cv.CV_8UC4);
		this.hsv = new cv.Mat(height, width, cv.CV_8UC3);
		this.mask = new cv.Mat(height, width, cv.CV_8UC1);
		this.contourOutput = new cv.Mat(height, width, cv.CV_8UC4);

		this.frameOriginal = new Uint8ClampedArray(width * height * 4);
		this.frameHsv = new Uint8ClampedArray(width * height * 4);
		this.frameMask = new Uint8ClampedArray(width * height * 4);
		this.frameContour = new Uint8ClampedArray(width * height * 4);
	}

	/**
	 * 특정 HSV 범위 내에서 공의 위치를 감지
	 */
	private findBall(
		hsv: Mat,
		low: number[],
		high: number[],
	): { x: number; y: number } | null {
		const lowMat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), low);
		const highMat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), high);
		const mask = new cv.Mat();

		cv.inRange(hsv, lowMat, highMat, mask);

		// 모폴로지 연산을 이용한 노이즈 제거
		const ksize = new cv.Size(3, 3);
		const M = cv.getStructuringElement(cv.MORPH_RECT, ksize);
		cv.morphologyEx(mask, mask, cv.MORPH_OPEN, M);
		M.delete();

		const contours = new cv.MatVector();
		const hierarchy = new cv.Mat();
		cv.findContours(
			mask,
			contours,
			hierarchy,
			cv.RETR_EXTERNAL,
			cv.CHAIN_APPROX_SIMPLE,
		);

		let pos: { x: number; y: number } | null = null;
		let maxArea = 0;

		for (let i = 0; i < contours.size(); i++) {
			const cnt = contours.get(i);
			const area = cv.contourArea(cnt);
			if (area > maxArea && area > 100) {
				maxArea = area;
				const moments = cv.moments(cnt);
				pos = {
					x: (moments.m10 / moments.m00 / this.width) * 1000,
					y: (moments.m01 / moments.m00 / this.height) * 1000,
				};

				// 디버깅용 외곽선 그리기
				const color = new cv.Scalar(255, 255, 255, 255);
				cv.drawContours(this.contourOutput, contours, i, color, 2);
			}
			cnt.delete();
		}

		// 마지막 마스크 상태를 디버그 뷰에 저장 (예: 빨간 공 마스크)
		if (low[0] === 0) {
			const maskData = mask.data;
			for (let i = 0; i < maskData.length; i++) {
				const v = maskData[i];
				this.frameMask[i * 4] = v;
				this.frameMask[i * 4 + 1] = v;
				this.frameMask[i * 4 + 2] = v;
				this.frameMask[i * 4 + 3] = 255;
			}
		}

		mask.delete();
		lowMat.delete();
		highMat.delete();
		contours.delete();
		hierarchy.delete();

		return pos;
	}

	/**
	 * 이미지 데이터를 처리하여 공 위치를 감지하고 디버그 프레임을 생성
	 * @param data RGBA 이미지 버퍼
	 */
	public process(data: Uint8ClampedArray): CuebitResult {
		this.frameOriginal.set(data);
		this.mat.data.set(data);

		// 색상 공간 변환: RGBA -> RGB -> HSV
		cv.cvtColor(this.mat, this.hsv, cv.COLOR_RGBA2RGB);
		cv.cvtColor(this.hsv, this.hsv, cv.COLOR_RGB2HSV);

		// 디버그용 HSV 데이터 복사
		const hsvData = this.hsv.data;
		for (let i = 0; i < hsvData.length / 3; i++) {
			this.frameHsv[i * 4] = hsvData[i * 3];
			this.frameHsv[i * 4 + 1] = hsvData[i * 3 + 1];
			this.frameHsv[i * 4 + 2] = hsvData[i * 3 + 2];
			this.frameHsv[i * 4 + 3] = 255;
		}

		this.mat.copyTo(this.contourOutput);

		// 일반적인 HSV 범위를 사용하여 공 감지
		const redPos =
			this.findBall(this.hsv, [0, 150, 100, 0], [10, 255, 255, 0]) ||
			this.findBall(this.hsv, [160, 150, 100, 0], [180, 255, 255, 0]);
		const yellowPos = this.findBall(
			this.hsv,
			[20, 100, 100, 0],
			[35, 255, 255, 0],
		);
		const whitePos = this.findBall(this.hsv, [0, 0, 180, 0], [180, 50, 255, 0]);

		this.frameContour.set(this.contourOutput.data);

		return {
			frames: {
				original: this.frameOriginal,
				hsv: this.frameHsv,
				mask: this.frameMask,
				contour: this.frameContour,
			},
			detected: {
				cue: whitePos,
				obj1: redPos,
				obj2: yellowPos,
				angle: 45, // 큐대 인식 로직 구현 전 임시값
			},
		};
	}

	/**
	 * OpenCV Mat 리소스 해제. 카메라 스트림 종료 시 호출 필수.
	 */
	public destroy(): void {
		this.mat.delete();
		this.hsv.delete();
		this.mask.delete();
		this.contourOutput.delete();
	}
}

export default Cuebit;
