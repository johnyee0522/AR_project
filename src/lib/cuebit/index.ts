import type { Mat } from "@techstark/opencv-js";
import { getOpenCv } from "../opencv";

const { cv } = await getOpenCv();

class Cuebit {
    private mat: Mat;
    private hsv: Mat;
    private mask: Mat; // 색상을 걸러낼 채 모양의 마스크 도화지
    private result: Uint8ClampedArray<ArrayBuffer>;

    constructor(width: number, height: number) {
        this.mat = new cv.Mat(height, width, cv.CV_8UC4);
        this.hsv = new cv.Mat(height, width, cv.CV_8UC3);
        this.mask = new cv.Mat(height, width, cv.CV_8UC1);
        this.result = new Uint8ClampedArray(width * height * 4);
    }

    public process(data: Uint8ClampedArray) {
        this.mat.data.set(data);
        cv.cvtColor(this.mat, this.hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(this.hsv, this.hsv, cv.COLOR_RGB2HSV);

        let ballPos = null; // 공의 X, Y 좌표를 담을 변수

        // 1. 빨간색 범위 설정 (나중에 당구장 환경에 맞게 팀원분이 정밀 조정할 부분)
        const low = new cv.Mat(this.hsv.rows, this.hsv.cols, this.hsv.type(), [0, 120, 70, 0]);
        const high = new cv.Mat(this.hsv.rows, this.hsv.cols, this.hsv.type(), [10, 255, 255, 0]);

        // 2. 빨간색만 흰색으로 추출 (마스크 씌우기)
        cv.inRange(this.hsv, low, high, this.mask);

        // 3. 덩어리(윤곽선) 찾기
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(this.mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        // 4. 노이즈를 무시하고 가장 큰 '빨간 덩어리'의 중심 좌표 찾기
        if (contours.size() > 0) {
            let maxArea = 0;
            let maxContourIdx = -1;

            for (let i = 0; i < contours.size(); ++i) {
                let cnt = contours.get(i);
                const area = cv.contourArea(cnt);
                if (area > maxArea) {
                    maxArea = area;
                    maxContourIdx = i;
                }
                cnt.delete(); // 메모리 릭 방지
            }

            if (maxArea > 300 && maxContourIdx !== -1) {
                let maxContour = contours.get(maxContourIdx);
                const moments = cv.moments(maxContour);
                const cx = moments.m10 / moments.m00;
                const cy = moments.m01 / moments.m00;
                ballPos = { x: cx, y: cy };
                maxContour.delete();
            }
        }

        // C++ 기반 라이브러리라 사용이 끝난 메모리는 반드시 해제
        low.delete();
        high.delete();
        contours.delete();
        hierarchy.delete();

        // 5. 배경 화면 데이터(기존 HSV)와 공의 좌표를 함께 리턴!
        const hsv = this.hsv.data;
        const result = this.result;
        const pixels = hsv.length / 3;
        for (let i = 0; i < pixels; i++) {
            result[i * 4] = hsv[i * 3];
            result[i * 4 + 1] = hsv[i * 3 + 1];
            result[i * 4 + 2] = hsv[i * 3 + 2];
            result[i * 4 + 3] = 255;
        }

        return {
            frameBuffer: this.result,
            ballPos: ballPos
        };
    }
}

export default Cuebit;