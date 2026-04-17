import cvModule from "@techstark/opencv-js";

/**
 * OpenCV 모듈을 비동기적으로 초기화하고 반환
 */
export async function getOpenCv() {
	let cv: typeof cvModule;
	if (cvModule instanceof Promise) {
		cv = await cvModule;
	} else {
		if (cvModule.Mat) {
			// 이미 초기화됨
			cv = cvModule;
		} else {
			await new Promise<void>((resolve) => {
				cvModule.onRuntimeInitialized = () => resolve();
			});
			cv = cvModule;
		}
	}
	return { cv };
}

/**
 * OpenCV 예외 포인터를 읽기 가능한 에러 객체로 변환
 */
export function translateException(cv: typeof cvModule, err: unknown) {
	if (typeof err === "number") {
		try {
			const exception = cv.exceptionFromPtr(err);
			return exception;
		} catch (_error) {
			// 변환 실패 시 무시
		}
	}
	return err;
}
