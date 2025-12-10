import { decodeWavFile } from "wav-file-decoder";
import { encodeWavFileFromArrays } from "wav-file-encoder";
import {
  create as createResampler,
  ConverterType,
} from "@alexanderolsen/libsamplerate-js";

// WavFileType は const enum のため isolatedModules 環境では直接参照できない
// wav-file-encoder の WavFileType: int16 = 0, float32 = 1
const WAV_FILE_TYPE_INT16 = 0;

/**
 * 複数の WAV Blob を連結して1つの WAV Blob を生成する。
 * エンジン側の connect_base64_waves() と同等の処理を行う。
 *
 * 処理フロー:
 * 1. 各 Blob を wav-file-decoder でデコードして Float32 配列に変換
 * 2. 最大サンプルレート・最大チャンネル数を取得
 * 3. チャンネル数を統一（モノラル→ステレオ変換）
 * 4. サンプルレートを統一（libsamplerate-js でリサンプリング）
 * 5. PCM サンプルデータを連結
 * 6. wav-file-encoder で 16bit PCM WAV にエンコードして Blob として返却
 *
 * @param blobs 連結する WAV Blob の配列（連結順）
 * @returns 連結された WAV Blob（16bit PCM）
 * @throws Error WAV ファイルが含まれていない場合、またはサポートされていないチャンネル数の場合
 */
export async function concatenateWavBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) {
    throw new Error("WAV ファイルが含まれていません");
  }

  // 単一の Blob の場合はそのまま返す
  if (blobs.length === 1) {
    return blobs[0];
  }

  // 1. 各 Blob をデコードして Float32 配列に変換
  const decoded = await Promise.all(
    blobs.map(async (blob) => {
      const arrayBuffer = await blob.arrayBuffer();
      const audioData = decodeWavFile(arrayBuffer);
      return {
        sampleRate: audioData.sampleRate,
        numberOfChannels: audioData.numberOfChannels,
        channelData: audioData.channelData, // Float32Array[]
      };
    }),
  );

  // 2. 最大サンプルレート・最大チャンネル数を取得
  const maxSampleRate = Math.max(...decoded.map((d) => d.sampleRate));
  const maxChannels = Math.max(...decoded.map((d) => d.numberOfChannels));
  if (maxChannels <= 0 || maxChannels > 2) {
    throw new Error("サポートするチャンネル数は 1 または 2 のみです");
  }

  // 3. 各クリップを maxSampleRate / maxChannels に揃えてリサンプル
  const interleavedSegments: Float32Array[] = [];

  for (const clip of decoded) {
    const { sampleRate, numberOfChannels, channelData } = clip;

    // チャンネル数を揃える（mono -> stereo）
    const channels: Float32Array[] = [];
    if (numberOfChannels === maxChannels) {
      for (let ch = 0; ch < numberOfChannels; ch++) {
        channels.push(channelData[ch]);
      }
    } else if (numberOfChannels === 1 && maxChannels === 2) {
      // モノラルをステレオに変換（両チャンネルに同じデータをコピー）
      const mono = channelData[0];
      channels.push(mono, mono);
    } else {
      throw new Error(
        `未サポートのチャンネル変換: ${numberOfChannels} -> ${maxChannels}`,
      );
    }

    const frames = channels[0].length;

    // libsamplerate-js は interleaved Float32 を要求する
    const interleavedIn = new Float32Array(frames * maxChannels);
    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < maxChannels; ch++) {
        interleavedIn[i * maxChannels + ch] = channels[ch][i];
      }
    }

    // サンプルレートが既に一致していればそのまま
    if (sampleRate === maxSampleRate) {
      interleavedSegments.push(interleavedIn);
      continue;
    }

    // 4. libsamplerate-js でリサンプリング
    const resampler = await createResampler(
      maxChannels,
      sampleRate,
      maxSampleRate,
      {
        converterType: ConverterType.SRC_SINC_BEST_QUALITY,
      },
    );
    const interleavedOut = resampler.simple(interleavedIn);
    resampler.destroy();

    interleavedSegments.push(interleavedOut);
  }

  // 5. interleaved データを全部連結
  const totalLength = interleavedSegments.reduce(
    (sum, seg) => sum + seg.length,
    0,
  );
  const interleavedAll = new Float32Array(totalLength);
  let offset = 0;
  for (const seg of interleavedSegments) {
    interleavedAll.set(seg, offset);
    offset += seg.length;
  }

  const totalFrames = totalLength / maxChannels;

  // 6. エンコード用に de-interleave してチャンネル配列に戻す
  const outChannels: Float32Array[] = [];
  for (let ch = 0; ch < maxChannels; ch++) {
    outChannels[ch] = new Float32Array(totalFrames);
  }
  for (let i = 0; i < totalFrames; i++) {
    for (let ch = 0; ch < maxChannels; ch++) {
      outChannels[ch][i] = interleavedAll[i * maxChannels + ch];
    }
  }

  // 7. 16bit PCM で WAV エンコード
  const wavBuffer = encodeWavFileFromArrays(
    outChannels,
    maxSampleRate,
    WAV_FILE_TYPE_INT16,
  );

  return new Blob([wavBuffer], { type: "audio/wav" });
}
