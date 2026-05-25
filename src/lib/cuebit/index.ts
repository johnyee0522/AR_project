import cv from "@techstark/opencv-js";
import type { InferenceSession } from "onnxruntime-web";
import * as ort from "onnxruntime-web/webgpu";
import {
	alignTo16,
	measure,
	rerange,
	snapshotMat,
	withMatScope,
} from "@/common";
import hyperparams from "@/config/hyperparams";
import type { ONNX } from "@/lib/onnx";
import type { FrameInfo } from "../capture";
import hwc2chwShader from "./shaders/hwc2chw.wgsl";
import maskShader from "./shaders/mask.wgsl";
import resizeShader from "./shaders/resize.wgsl";

/**
 * 踰꾪띁 ?몃뜳?? */
export type BufferIndex = 0 | 1;

/**
 * ???꾨젅??異붾줎???꾩슂??踰꾪띁 ?명듃
 */
interface BufferSet {
	readonly resizePipeline: GPUComputePipeline;
	readonly preprocessPipeline: GPUComputePipeline;
	/**
	 * ?꾨젅?꾩쓣 蹂듭궗???띿뒪泥?	 */
	readonly frameTexture: GPUTexture;
	/**
	 * 由ъ궗?댁쫰???꾨젅???띿뒪爾?	 */
	readonly resizedFrameTexture: GPUTexture;
	/**
	 * 由ъ궗?댁쫰???꾨젅?꾩쓣 ??ν븷 ?띿뒪泥?	 */
	readonly resizeBindGroup: GPUBindGroup;
	/**
	 * ?곗씠?붿뿉???꾨젅???곗씠?곕? ?쎌뼱?????ъ슜?섎뒗 諛붿씤??洹몃９
	 */
	readonly preprocessBindGroup: GPUBindGroup;
	/**
	 * ?곗씠?붿뿉???꾨젅???곗씠?곕? ?쎌뼱??踰꾪띁
	 */
	readonly inputBuffer: GPUBuffer;
	/**
	 * ONNX Runtime?먯꽌 GPU 踰꾪띁瑜??먯꽌濡??ъ슜?????꾩슂???섑띁 媛앹껜
	 */
	readonly inputTensor: ort.Tensor;
	/**
	 * 紐⑤뜽??泥?踰덉㎏ 異쒕젰 踰꾪띁
	 */
	readonly detectionsBuffer: GPUBuffer;
	/**
	 * 紐⑤뜽??泥?踰덉㎏ 異쒕젰 ?먯꽌
	 */
	readonly detectionsTensor: ort.Tensor;
	/**
	 * 紐⑤뜽????踰덉㎏ 異쒕젰 踰꾪띁
	 */
	readonly protosBuffer: GPUBuffer;
	/**
	 * 紐⑤뜽????踰덉㎏ 異쒕젰 ?먯꽌
	 */
	readonly protosTensor: ort.Tensor;
	/**
	 * output0瑜?CPU???꾨떖?섍린 ?꾪븳 staging 踰꾪띁
	 */
	readonly detectionsReadBuffer: GPUBuffer;
	/**
	 * ?꾩옱 踰꾪띁?????吏꾪뻾 以묒씤 異붾줎 寃곌낵瑜??섑??대뒗 Promise
	 */
	pendingSegmentationInference: Promise<InferenceSession.OnnxValueMapType> | null;

	readonly maskPipeline: GPUComputePipeline;
	/**
	 * 留덉뒪???앹꽦 ?곗씠?붿뿉???ъ슜??諛붿씤??洹몃９
	 */
	readonly maskBindgroup: GPUBindGroup;
	/**
	 * 留덉뒪???앹꽦 ?곗씠?붿뿉???ъ슜??Params 踰꾪띁
	 */
	readonly maskCandidateIndexBuffer: GPUBuffer;
	/**
	 * 留덉뒪???대?吏瑜???ν븯??踰꾪띁
	 */
	readonly maskBuffer: GPUBuffer;
	/**
	 * 留덉뒪???대?吏???꾨젅???띿뒪泥?	 */
	readonly maskFrameTexture: GPUTexture;
	/**
	 * ?뚯씠釉?留덉뒪???대?吏瑜???ν븯??踰꾪띁
	 */
	readonly tableMaskFrameTexture: GPUTexture;
	/**
	 * ??留덉뒪???대?吏瑜???ν븯??踰꾪띁
	 */
	readonly cueMaskFrameTexture: GPUTexture;
	/**
	 * 留덉뒪???대?吏瑜?CPU???꾨떖?섍린 ?꾪븳 staging 踰꾪띁:
	 */
	readonly tableMaskReadBuffer: GPUBuffer;
	/**
	 * ??留덉뒪???대?吏瑜?CPU???꾨떖?섍린 ?꾪븳 staging 踰꾪띁
	 */
	readonly cueMaskReadBuffer: GPUBuffer;
}

interface Postprocess {
	tableMask: Float32Array | null;
	balls: Vector2[];
	cue: {
		bbox: {
			lt: Vector2;
			rb: Vector2;
		};
		mask: Float32Array | null;
	} | null;
}

interface Quad {
	readonly points: {
		readonly topLeft: Vector2;
		readonly bottomLeft: Vector2;
		readonly bottomRight: Vector2;
		readonly topRight: Vector2;
	};
}

function dist(a: Vector2, b: Vector2): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function toQuad(points: [Vector2, Vector2, Vector2, Vector2]): Quad {
	const indexedPoints = points.map((point, index) => ({
		point,
		index,
	}));

	const leftmost = indexedPoints.reduce((acc, cur) =>
		acc.point.x < cur.point.x ? acc : cur,
	);
	const rightmost = indexedPoints[(leftmost.index + 2) % 4];

	const topmost = indexedPoints.reduce((acc, cur) =>
		acc.point.y < cur.point.y ? acc : cur,
	);
	const bottommost = indexedPoints[(topmost.index + 2) % 4];

	if (
		dist(leftmost.point, topmost.point) > dist(leftmost.point, bottommost.point)
	) {
		return {
			points: {
				topLeft: bottommost.point,
				bottomLeft: leftmost.point,
				bottomRight: topmost.point,
				topRight: rightmost.point,
			},
		};
	}

	return {
		points: {
			topLeft: leftmost.point,
			bottomLeft: topmost.point,
			bottomRight: rightmost.point,
			topRight: bottommost.point,
		},
	};
}

function getTransformMatrix(quad: Quad) {
	return withMatScope((track) => {
		const src = track(
			cv.matFromArray(4, 1, cv.CV_32FC2, [
				quad.points.topLeft.x ?? 0,
				quad.points.topLeft.y ?? 0,
				quad.points.bottomLeft.x ?? 0,
				quad.points.bottomLeft.y ?? 0,
				quad.points.bottomRight.x ?? 0,
				quad.points.bottomRight.y ?? 0,
				quad.points.topRight.x ?? 0,
				quad.points.topRight.y ?? 0,
			]),
		);
		const dst = track(
			cv.matFromArray(
				4,
				1,
				cv.CV_32FC2,
				[
					// Top-Left
					0, 1422,
					// Bottom-Left
					0, 0,
					// Bottom-Right
					2844, 0,
					// Top-Right
					2844, 1422,
				],
			),
		);
		const transform = track(cv.getPerspectiveTransform(src, dst));
		const inverseTransform = track(transform.inv(cv.DECOMP_LU));

		return {
			transform: snapshotMat(transform),
			inverseTransform: snapshotMat(inverseTransform),
		};
	});
}

function findTableQuad(
	mask: Float32Array,
	width: number,
	height: number,
): [Vector2, Vector2, Vector2, Vector2] | null {
	const result = withMatScope((track) => {
		// Float32 ??0/255 binary Mat
		const src = track(new cv.Mat(height, width, cv.CV_8UC1));
		for (let i = 0; i < width * height; i++) {
			src.data[i] = mask[i] > 0.5 ? 255 : 0;
		}

		// TODO: roi + ?몄씠利??쒓굅 ?댁빞??
		const contours = track(new cv.MatVector());
		const hierarchy = track(new cv.Mat());
		cv.findContours(
			src,
			contours,
			hierarchy,
			cv.RETR_EXTERNAL,
			cv.CHAIN_APPROX_SIMPLE,
		);

		// 가장 큰 컨투어 선택
		let maxArea = 0;
		let maxIdx = -1;
		for (let i = 0; i < contours.size(); i++) {
			const area = cv.contourArea(contours.get(i));
			if (area > maxArea) {
				maxArea = area;
				maxIdx = i;
			}
		}

		let result: Vector2[] | null = null;
		if (maxIdx >= 0) {
			const cnt = contours.get(maxIdx);
			const approx = track(new cv.Mat());
			const peri = cv.arcLength(cnt, true);
			cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

			if (approx.rows === 4) {
				// 4?먯씠硫?洹몃?濡??ш컖?뺤쑝濡??ъ슜

				result = [];
				for (let i = 0; i < 4; i++) {
					result.push({
						x: approx.data32S[i * 2],
						y: approx.data32S[i * 2 + 1],
					});
				}
			} else {
				// 4?먯씠 ?꾨땺 ??理쒖냼 ?몄젒 ?뚯쟾 ?ш컖?뺤쑝濡??대갚

				const rect = cv.minAreaRect(cnt);
				const box = cv.boxPoints(rect);

				result = box.map((p) => ({ x: p.x, y: p.y }));
			}
		}

		return result;
	});

	return result && [result[0], result[1], result[2], result[3]];
}

function findCue(
	mask: Float32Array,
	width: number,
	height: number,
	region: { lt: Vector2; rb: Vector2 },
): [Vector2, Vector2] | null {
	return withMatScope((track) => {
		// Float32 ??0/255 binary Mat
		const src = track(new cv.Mat(height, width, cv.CV_8UC1));
		for (let i = 0; i < width * height; i++) {
			src.data[i] = mask[i] > 0.5 ? 255 : 0;
		}

		const roi = track(
			src.roi(
				new cv.Rect(
					region.lt.x,
					region.lt.y,
					region.rb.x - region.lt.x,
					region.rb.y - region.lt.y,
				),
			),
		);

		const lines = track(new cv.Mat());
		cv.HoughLinesP(roi, lines, 1, Math.PI / 180, 4, 10, 5);

		let result: [Vector2, Vector2] | null = null;
		let lineLength = 0;
		for (let i = 0; i < lines.rows; i++) {
			const line: [Vector2, Vector2] = [
				{
					x: lines.data32S[i * 4] + region.lt.x,
					y: lines.data32S[i * 4 + 1] + region.lt.y,
				},
				{
					x: lines.data32S[i * 4 + 2] + region.lt.x,
					y: lines.data32S[i * 4 + 3] + region.lt.y,
				},
			];

			if (dist(line[0], line[1]) > lineLength) {
				lineLength = dist(line[0], line[1]);
				result = line;
			}
		}

		return result;
	});
}

class Detection {
	public readonly index: number;
	public readonly lt: Vector2;
	public readonly rb: Vector2;
	public readonly confidence: number;
	public readonly classId: number;
	public readonly coefficients: Float32Array;

	constructor(index: number, chunk: Float32Array) {
		this.index = index;
		this.lt = {
			x: chunk[0],
			y: chunk[1],
		};
		this.rb = {
			x: chunk[2],
			y: chunk[3],
		};
		this.confidence = chunk[4];
		this.classId = chunk[5];
		this.coefficients = chunk.subarray(6);
	}
}

function toDetections(detection: Float32Array, chunkSize: number): Detection[] {
	const detections: Detection[] = [];

	for (let i = 0; i < detection.length; i++) {
		const offset = i * chunkSize;
		detections.push(
			new Detection(i, detection.subarray(offset, offset + chunkSize)),
		);
	}

	return detections;
}

/**
 * ?꾩껜 ?뚯씠?꾨씪???ㅽ뻾 ?대옒?? */
class Cuebit {
	private device: GPUDevice;
	private onnx: ONNX;
	private frameInfo: FrameInfo;
	private preprocessShaderModule: GPUShaderModule;
	private maskShaderModule: GPUShaderModule;
	private buffers: [BufferSet, BufferSet];
	private currentBufferIndex: BufferIndex = 0;

	constructor(device: GPUDevice, onnx: ONNX, frameInfo: FrameInfo) {
		this.device = device;
		this.onnx = onnx;
		this.frameInfo = frameInfo;
		this.preprocessShaderModule = device.createShaderModule({
			code: hwc2chwShader,
		});
		this.maskShaderModule = device.createShaderModule({
			code: maskShader,
		});

		this.buffers = [
			this.createBufferSet(frameInfo, onnx),
			this.createBufferSet(frameInfo, onnx),
		];
	}

	private createBufferSet(frameInfo: FrameInfo, onnx: ONNX): BufferSet {
		const resizePipeline = this.device.createComputePipeline({
			layout: "auto",
			compute: {
				module: this.device.createShaderModule({
					code: resizeShader,
				}),
				entryPoint: "resize",
			},
		});
		const preprocessPipeline = this.device.createComputePipeline({
			layout: "auto",
			compute: {
				module: this.preprocessShaderModule,
				entryPoint: "hwc2chw",
			},
		});
		const frameTexture = this.device.createTexture({
			size: [frameInfo.width, frameInfo.height],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.COPY_SRC |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});

		const resizedFrameTexture = this.device.createTexture({
			size: [
				onnx.segementation.input.feeds.image.width,
				onnx.segementation.input.feeds.image.height,
			],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.COPY_SRC |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.STORAGE_BINDING,
		});

		const sampler = this.device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
		});

		const resizeParamsBuffer = this.device.createBuffer({
			label: "Resize Params Buffer",
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			size: alignTo16(4 * 4), // width, height, srcWidth, srcHeight
		});
		this.device.queue.writeBuffer(
			resizeParamsBuffer,
			0,
			new Uint32Array([
				frameInfo.width,
				frameInfo.height,
				onnx.segementation.input.feeds.image.width,
				onnx.segementation.input.feeds.image.height,
			]),
		);

		const resizeBindGroup = this.device.createBindGroup({
			layout: resizePipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: frameTexture.createView(),
				},
				{
					binding: 1,
					resource: resizedFrameTexture.createView(),
				},
				{
					binding: 2,
					resource: {
						buffer: resizeParamsBuffer,
					},
				},
				{
					binding: 3,
					resource: sampler,
				},
			],
		});

		const inputBuffer = this.device.createBuffer({
			label: "Input Buffer",
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			// 4 byte * 3 channel * width * height
			size: alignTo16(4 * onnx.segementation.input.feeds.image.size),
		});

		const inputTensor = ort.Tensor.fromGpuBuffer(inputBuffer, {
			dataType: "float32",
			dims: onnx.segementation.input.feeds.image.shape,
		});

		const preprocessBindGroup = this.device.createBindGroup({
			layout: preprocessPipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: resizedFrameTexture.createView(),
				},
				{
					binding: 1,
					resource: {
						buffer: inputBuffer,
					},
				},
			],
		});

		const detectionsBuffer = this.device.createBuffer({
			label: "Detections Buffer",
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			size: alignTo16(4 * onnx.segementation.output.fetchs.detections.size),
		});
		const detectionsTensor = ort.Tensor.fromGpuBuffer(detectionsBuffer, {
			dataType: "float32",
			dims: onnx.segementation.output.fetchs.detections.shape,
		});

		const protosBuffer = this.device.createBuffer({
			label: "Protos Buffer",
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			size: alignTo16(4 * onnx.segementation.output.fetchs.protos.size),
		});
		const protosTensor = ort.Tensor.fromGpuBuffer(protosBuffer, {
			dataType: "float32",
			dims: onnx.segementation.output.fetchs.protos.shape,
		});
		const detectionsReadBuffer = this.device.createBuffer({
			label: "Detections Read Buffer",
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			size: detectionsBuffer.size,
		});

		// mask
		const maskPipeline = this.device.createComputePipeline({
			layout: "auto",
			compute: {
				module: this.maskShaderModule,
				entryPoint: "createMask",
			},
		});
		const maskCandidateIndexBuffer = this.device.createBuffer({
			label: "Mask Candidate Index Buffer",
			size: alignTo16(1),
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		const maskBuffer = this.device.createBuffer({
			label: "Mask Buffer",
			usage:
				GPUBufferUsage.STORAGE |
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST,
			size: alignTo16(
				4 *
					hyperparams.maxCandidateCount *
					onnx.segementation.output.fetchs.protos.width *
					onnx.segementation.output.fetchs.protos.height,
			),
		});
		const maskFrameTexture = this.device.createTexture({
			size: [
				onnx.segementation.output.fetchs.protos.width,
				onnx.segementation.output.fetchs.protos.height,
			],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.COPY_SRC |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.STORAGE_BINDING,
		});
		const tableMaskFrameTexture = this.device.createTexture({
			size: [
				onnx.segementation.output.fetchs.protos.width,
				onnx.segementation.output.fetchs.protos.height,
			],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
		});
		const cueMaskFrameTexture = this.device.createTexture({
			size: [
				onnx.segementation.output.fetchs.protos.width,
				onnx.segementation.output.fetchs.protos.height,
			],
			format: "rgba8unorm",
			usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
		});
		const maskBindgroup = this.device.createBindGroup({
			layout: maskPipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: {
						buffer: detectionsBuffer,
					},
				},
				{
					binding: 1,
					resource: {
						buffer: protosBuffer,
					},
				},
				{
					binding: 2,
					resource: {
						buffer: maskCandidateIndexBuffer,
					},
				},
				{
					binding: 3,
					resource: {
						buffer: maskBuffer,
					},
				},
				{
					binding: 4,
					resource: maskFrameTexture.createView(),
				},
			],
		});
		const tableMaskReadBuffer = this.device.createBuffer({
			label: "Mask Read Buffer",
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			size: maskBuffer.size,
		});
		const cueMaskReadBuffer = this.device.createBuffer({
			label: "Mask Read Buffer",
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			size: maskBuffer.size,
		});

		return {
			resizePipeline,
			preprocessPipeline,
			frameTexture,
			resizedFrameTexture,
			resizeBindGroup,
			preprocessBindGroup,
			inputBuffer,
			inputTensor,
			detectionsBuffer,
			detectionsTensor,
			protosBuffer,
			protosTensor,
			detectionsReadBuffer,
			pendingSegmentationInference: null,
			maskPipeline,
			maskBindgroup,
			maskCandidateIndexBuffer,
			maskBuffer,
			maskFrameTexture,
			tableMaskFrameTexture,
			cueMaskFrameTexture,
			tableMaskReadBuffer,
			cueMaskReadBuffer,
		};
	}

	/**
	 * ?꾨젅???꾩쿂由?	 */
	private preprocessFrame(frame: VideoFrame, buffer: BufferSet): void {
		// ?꾨젅?꾩쓣 ?띿뒪泥섎줈 蹂듭궗
		this.copyFrameToTexture(frame, buffer);

		// 프레임 전처리
		const commandEncoder = this.device.createCommandEncoder();
		this.resize(commandEncoder, buffer);
		this.hwc2chw(commandEncoder, buffer);
		this.device.queue.submit([commandEncoder.finish()]);
	}

	private copyFrameToTexture(frame: VideoFrame, buffer: BufferSet): void {
		// NOTE: importExternalTexture 怨좊젮
		this.device.queue.copyExternalImageToTexture(
			{
				source: frame,
			},
			{
				texture: buffer.frameTexture,
			},
			[this.frameInfo.width, this.frameInfo.height],
		);
	}

	private resize(encoder: GPUCommandEncoder, buffer: BufferSet): void {
		const pass = encoder.beginComputePass();
		pass.setPipeline(buffer.resizePipeline);
		pass.setBindGroup(0, buffer.resizeBindGroup);
		pass.dispatchWorkgroups(
			alignTo16(this.onnx.segementation.input.feeds.image.width),
			alignTo16(this.onnx.segementation.input.feeds.image.height),
		);
		pass.end();
	}

	private hwc2chw(encoder: GPUCommandEncoder, buffer: BufferSet): void {
		const pass = encoder.beginComputePass();
		pass.setPipeline(buffer.preprocessPipeline);
		pass.setBindGroup(0, buffer.preprocessBindGroup);
		pass.dispatchWorkgroups(
			alignTo16(this.onnx.segementation.input.feeds.image.width),
			alignTo16(this.onnx.segementation.input.feeds.image.height),
		);
		pass.end();
	}

	private select(
		detections: Detection[],
	): [Detection | null, Detection[], Detection | null] {
		let table: Detection | null = null;
		const balls: Detection[] = [];
		const ballClassIds = new Set([0, 2, 4, 5]);
		let cue: Detection | null = null;

		for (const detection of detections) {
			if (detection.classId === 3) {
				// NOTE: 2: table
				if (table === null || detection.confidence > table.confidence) {
					table = detection;
				}
			} else if (ballClassIds.has(detection.classId)) {
				// NOTE: 0,1,3,4: balls
				if (detection.confidence > 0.25) {
					balls.push(detection);
				}
			} else if (detection.classId === 1) {
				if (cue === null || detection.confidence > cue.confidence) {
					cue = detection;
				}
			}
		}

		return [table, balls, cue];
	}

	private async getMask(
		buffer: BufferSet,
		tableDetection: Detection | null,
		cueDetection: Detection | null,
	): Promise<[Float32Array | null, Float32Array | null]> {
		// table mask pass
		if (tableDetection) {
			this.device.queue.writeBuffer(
				buffer.maskCandidateIndexBuffer,
				0,
				new Uint32Array([tableDetection.index]),
			);
			const commandEncoder = this.device.createCommandEncoder();
			const tableMaskPass = commandEncoder.beginComputePass();
			tableMaskPass.setPipeline(buffer.maskPipeline);
			tableMaskPass.setBindGroup(0, buffer.maskBindgroup);
			tableMaskPass.dispatchWorkgroups(
				Math.ceil(this.onnx.segementation.output.fetchs.protos.width / 16),
				Math.ceil(this.onnx.segementation.output.fetchs.protos.height / 16),
			);
			tableMaskPass.end();
			commandEncoder.copyBufferToBuffer(
				buffer.maskBuffer,
				0,
				buffer.tableMaskReadBuffer,
				0,
				// 4 byte * ?꾨낫 detection * width * height
				4 *
					hyperparams.maxCandidateCount *
					this.onnx.segementation.output.fetchs.protos.width *
					this.onnx.segementation.output.fetchs.protos.height,
			);
			commandEncoder.copyTextureToTexture(
				{
					texture: buffer.maskFrameTexture,
				},
				{
					texture: buffer.tableMaskFrameTexture,
				},
				[
					this.onnx.segementation.output.fetchs.protos.width,
					this.onnx.segementation.output.fetchs.protos.height,
				],
			);

			this.device.queue.submit([commandEncoder.finish()]);
		}

		// cue mask pass
		if (cueDetection) {
			this.device.queue.writeBuffer(
				buffer.maskCandidateIndexBuffer,
				0,
				new Uint32Array([cueDetection.index]),
			);
			const commandEncoder = this.device.createCommandEncoder();
			const cueMaskPass = commandEncoder.beginComputePass();
			cueMaskPass.setPipeline(buffer.maskPipeline);
			cueMaskPass.setBindGroup(0, buffer.maskBindgroup);
			cueMaskPass.dispatchWorkgroups(
				Math.ceil(this.onnx.segementation.output.fetchs.protos.width / 16),
				Math.ceil(this.onnx.segementation.output.fetchs.protos.height / 16),
			);
			cueMaskPass.end();
			commandEncoder.copyBufferToBuffer(
				buffer.maskBuffer,
				0,
				buffer.cueMaskReadBuffer,
				0,
				// 4 byte * ?꾨낫 detection * width * height
				4 *
					hyperparams.maxCandidateCount *
					this.onnx.segementation.output.fetchs.protos.width *
					this.onnx.segementation.output.fetchs.protos.height,
			);
			commandEncoder.copyTextureToTexture(
				{
					texture: buffer.maskFrameTexture,
				},
				{
					texture: buffer.cueMaskFrameTexture,
				},
				[
					this.onnx.segementation.output.fetchs.protos.width,
					this.onnx.segementation.output.fetchs.protos.height,
				],
			);
			this.device.queue.submit([commandEncoder.finish()]);
		}

		await Promise.all([
			buffer.tableMaskReadBuffer.mapAsync(GPUMapMode.READ),
			buffer.cueMaskReadBuffer.mapAsync(GPUMapMode.READ),
		]);

		const tableMask =
			tableDetection &&
			new Float32Array(buffer.tableMaskReadBuffer.getMappedRange().slice(0));
		buffer.tableMaskReadBuffer.unmap();

		const cueMask =
			cueDetection &&
			new Float32Array(buffer.cueMaskReadBuffer.getMappedRange().slice(0));
		buffer.cueMaskReadBuffer.unmap();

		return [tableMask, cueMask];
	}

	private async postprocess(buffer: BufferSet): Promise<Postprocess | null> {
		// 이전 프레임 추론 결과 대기
		await measure(
			() => buffer.pendingSegmentationInference,
			"Pending Inference",
		);

		// buffer??異붾줎 寃곌낵瑜?staging 踰꾪띁濡?蹂듭궗
		const stagingCommandEncoder = this.device.createCommandEncoder();
		stagingCommandEncoder.copyBufferToBuffer(
			buffer.detectionsBuffer,
			0,
			buffer.detectionsReadBuffer,
			0,
			buffer.detectionsReadBuffer.size,
		);
		this.device.queue.submit([stagingCommandEncoder.finish()]);

		await buffer.detectionsReadBuffer.mapAsync(GPUMapMode.READ);
		const detections = toDetections(
			new Float32Array(buffer.detectionsReadBuffer.getMappedRange().slice(0)),
			this.onnx.segementation.output.fetchs.detections.stride,
		);
		buffer.detectionsReadBuffer.unmap();

		// 異붾줎 寃곌낵?먯꽌 ?뚯씠釉? 怨? ???좏깮
		const [table, balls, cue] = this.select(detections);

		console.log("Detected Table: ", table);
		console.log("Detected Cue: ", cue);

		const [tableMask, cueMask] = await this.getMask(buffer, table, cue);

		return {
			tableMask,
			balls: balls.map((ball) => ({
				x: (ball.lt.x + ball.rb.x) / 2,
				y: (ball.lt.y + ball.rb.y) / 2,
			})),
			cue: cue && {
				bbox: {
					lt: rerange(
						cue.lt,
						this.onnx.segementation.input.feeds.image.width,
						this.onnx.segementation.output.fetchs.protos.width,
					),
					rb: rerange(
						cue.rb,
						this.onnx.segementation.input.feeds.image.width,
						this.onnx.segementation.output.fetchs.protos.width,
					),
				},
				mask: cueMask,
			},
		};
	}

	/**
	 *
	 */
	public async process(frame: VideoFrame) {
		// ?댁쟾 踰꾪띁 ?몃뜳??怨꾩궛
		const previousBufferIndex = 1 - this.currentBufferIndex;

		// ?꾩옱 踰꾪띁? ?댁쟾 踰꾪띁 李몄“
		const [currentBuffer, previousBuffer] = [
			this.buffers[this.currentBufferIndex],
			this.buffers[previousBufferIndex],
		];

		this.preprocessFrame(frame, currentBuffer);

		const postprocessResult = await measure(
			() => this.postprocess(previousBuffer),
			"Get Mask",
		);

		// ?댁쟾 異붾줎???꾨즺?????꾩옱 踰꾪띁?????異붾줎 ?쒖옉
		currentBuffer.pendingSegmentationInference =
			this.onnx.segementation.session.run(
				{
					[this.onnx.segementation.input.feeds.image.name]:
						currentBuffer.inputTensor,
				},
				{
					[this.onnx.segementation.output.fetchs.detections.name]:
						currentBuffer.detectionsTensor,
					[this.onnx.segementation.output.fetchs.protos.name]:
						currentBuffer.protosTensor,
				},
			);

		const getTablePoints = (result: Postprocess) => {
			if (!result.tableMask) {
				console.log("?뚯씠釉?媛먯? ?ㅽ뙣");
				return null;
			}

			const quad = findTableQuad(
				result.tableMask,
				this.onnx.segementation.output.fetchs.protos.width,
				this.onnx.segementation.output.fetchs.protos.height,
			);

			if (result.tableMask !== null && quad === null) {
				console.log("table mask濡쒕???quad 李얘린 ?ㅽ뙣");
			}

			return quad;
		};

		const getCuePoints = (result: Postprocess) => {
			if (!result.cue) {
				console.log("??媛먯? ?ㅽ뙣");
				return null;
			}

			if (!result.cue.mask) {
				console.log("??留덉뒪???앹꽦 ?ㅽ뙣");
				return null;
			}

			const cue = findCue(
				result.cue.mask,
				this.onnx.segementation.output.fetchs.protos.width,
				this.onnx.segementation.output.fetchs.protos.height,
                // NOTE: ?섏쨷???ㅼ???蹂?섏씠 ?꾩슂?좎닔???덉쓬
				{
					lt: {
						x: result.cue.bbox.lt.x,
						y: result.cue.bbox.lt.y,
					},
					rb: {
						x: result.cue.bbox.rb.x,
						y: result.cue.bbox.rb.y,
					},
				},
			);

			if (result.cue.mask !== null && cue === null) {
				console.log("cue mask濡쒕??????앹젏 李얘린 ?ㅽ뙣");
			}

			return cue;
		};

		const points = measure(
			() => postprocessResult && getTablePoints(postprocessResult),
			"Find Largest Quad",
		);
		const quad = points && toQuad(points);
		const line = measure(
			() => postprocessResult && getCuePoints(postprocessResult),
			"Find Cue",
		);

		const table = quad
			? {
					quad,
					matrix: getTransformMatrix(quad),
				}
			: null;

		// 踰꾪띁 ?몃뜳???낅뜲?댄듃
		this.currentBufferIndex = (1 - this.currentBufferIndex) as BufferIndex;

		const scaleFactorX =
			this.onnx.segementation.output.fetchs.protos.width /
			this.onnx.segementation.input.feeds.image.width;
		const scaleFactorY =
			this.onnx.segementation.output.fetchs.protos.height /
			this.onnx.segementation.input.feeds.image.height;

		const balls =
			postprocessResult?.balls?.map((ball) => ({
				x: ball.x * scaleFactorX,
				y: ball.y * scaleFactorY,
			})) ?? [];

		return {
			table,
			balls,
			cue: postprocessResult?.cue && {
				bbox: postprocessResult.cue.bbox,
				line: line && {
					start: line[0],
					end: line[1],
				},
			},
		};
	}

	public getCurrentBufferIndex(): BufferIndex {
		return this.currentBufferIndex;
	}

	public getBuffer(bufferIndex: BufferIndex): BufferSet {
		return this.buffers[bufferIndex];
	}
}

export default Cuebit;



