import * as fs from 'fs';
import { getDirectorySize } from '../core/platform';
import { formatBytes, formatDuration, parseByteAmount } from '../util/format';

/** Only packages at least this big get live download progress display. */
export const LIVE_PROGRESS_MIN_BYTES = 100 * 1024 * 1024;

const TORCH_UNAVAILABLE_RE =
  /No matching distribution found for torch|Could not find a version that satisfies the requirement torch/i;

/** conda frame: "openssl-3.0.17 | 5.2 MB | ######8 | 68%" or without the bar. */
const CONDA_FRAME_RE =
  /^(.*?)\s*\|\s*([\d.]+)\s*([kMG]B)\s*\|\s*[#0-9]+\s*\|\s*([\d.]+)%\s*$/i;

/**
 * Parse a conda download frame, returning the shown package name (% shown
 * in the progress notification) when the frame is a real download line.
 */
export function parseCondaFrame(line: string): { name: string; percent: string; bytes: number } | undefined {
  const frame = line.match(CONDA_FRAME_RE)
    || line.match(/^(.*?)\s*\|\s*([\d.]+)\s*([kMG]B)\s+([\d.]+)%\s*$/i);
  if (!frame) return undefined;
  return {
    name: frame[1].trim(),
    percent: frame[4],
    bytes: parseByteAmount(frame[2], frame[3]),
  };
}

type PipFrame =
  | { kind: 'download'; totalBytes: number }
  | { kind: 'progress'; totalBytes: number; doneBytes: number; speed: number }
  | { kind: 'legacy'; totalBytes: number; doneBytes: number; speed: number };

function matchPipFrame(line: string): PipFrame | undefined {
  // "Downloading torch-2.5.1+cu121-...-linux_x86_64.whl (780.4 MB)"
  const sizeMatch = line.match(/Downloading\s+\S+\s*\(([\d.]+)\s*([kMG]?B)\)/i);
  if (sizeMatch) {
    return { kind: 'download', totalBytes: parseByteAmount(sizeMatch[1], sizeMatch[2]) };
  }
  // "45.2/780.4 MB 3.2 MB/s" | "45.2/780.4 MB [00:10<02:03, 3.2 MB/s]"
  const progMatch = line.match(/([\d.]+)\s*\/\s*([\d.]+)\s*([kMG]B)\b[\s\S]*?([\d.]+)\s*([kMG]?)B\/s/i);
  if (progMatch) {
    // the unit (group 3) applies to both sides of "45.2/780.4 MB"
    return {
      kind: 'progress',
      totalBytes: parseByteAmount(progMatch[2], progMatch[3]),
      doneBytes: parseByteAmount(progMatch[1], progMatch[3]),
      speed: parseByteAmount(progMatch[4], progMatch[5]),
    };
  }
  // old pip format: "torch-2.5.1.whl 780.4MB 3.2MB/s" (no spaces)
  const legacyMatch = line.match(/(\S+)\s+([\d.]+[kMG]B)\s+([\d.]+)\s*([kMG]?)B\/s/i);
  if (legacyMatch) {
    const legacySize = legacyMatch[2];
    return {
      kind: 'legacy',
      totalBytes: 0,
      doneBytes: parseByteAmount(legacySize.slice(0, -2), legacySize.slice(-2, -1)),
      speed: parseByteAmount(legacyMatch[3], legacyMatch[4]),
    };
  }
  return undefined;
}

export interface PipLineResult {
  /** Whether the raw line should be echoed to the output channel. */
  showLine: boolean;
  /** Progress-notification message, when this line carried a displayable frame. */
  message?: string;
  /** Whether the line proves the requested torch wheel does not exist. */
  torchUnavailable: boolean;
}

/**
 * Tracks a `pip install` run so the progress notification can show live
 * download speed/size. Keeps the byte counters that span many output lines.
 */
export class PipDownloadTracker {
  private totalBytes = 0;
  private doneBytes = 0;
  /**
   * Cumulative size of the watched scratch dirs when the current package's
   * download started. Those dirs keep the wheels of *every* package, so only
   * the growth since this baseline belongs to the package in flight. `-1` means
   * "capture the baseline on the next byte sample".
   */
  private diskBaseline = -1;

  constructor(private readonly minBytes = LIVE_PROGRESS_MIN_BYTES) {}

  handleLine(line: string): PipLineResult {
    const torchUnavailable = TORCH_UNAVAILABLE_RE.test(line);
    const frame = matchPipFrame(line);
    if (!frame) return { showLine: true, torchUnavailable };

    if (frame.kind === 'download') {
      // a new package starts: reset the counters and let the next byte sample
      // re-establish the disk baseline
      this.totalBytes = frame.totalBytes;
      this.doneBytes = 0;
      this.diskBaseline = -1;
      return { showLine: true, message: this.buildMessage(0), torchUnavailable };
    }

    // For a progress frame the package size is known; the legacy format only
    // exposes how much has already been fetched.
    const frameBytes = frame.kind === 'legacy' ? frame.doneBytes : frame.totalBytes;
    if (frameBytes >= this.minBytes) {
      return {
        showLine: true,
        message: this.report(frame.speed, frame.doneBytes, frame.totalBytes),
        torchUnavailable,
      };
    }
    // small package: stay quiet
    return { showLine: false, torchUnavailable };
  }

  /**
   * Feed a byte-count sample from watching pip's scratch directories. Used as
   * a fallback when pip prints nothing during a long download.
   *
   * `bytesOnDisk` is the *cumulative* size of the scratch dirs (all packages),
   * so only the growth since the current download started counts as progress;
   * otherwise a package downloaded after another one would instantly look
   * bigger than its own total size.
   */
  handleByteSample(speedBytesPerSec: number, bytesOnDisk: number): string | undefined {
    if (this.diskBaseline < 0) {
      // first sample after the current download started: establish the baseline
      this.diskBaseline = bytesOnDisk;
      return undefined;
    }
    if (bytesOnDisk < this.diskBaseline) {
      // pip pruned a finished wheel from the cache: re-baseline instead of
      // reporting a negative amount
      this.diskBaseline = bytesOnDisk;
      return undefined;
    }
    return this.report(speedBytesPerSec, bytesOnDisk - this.diskBaseline, this.totalBytes);
  }

  private report(speedBytesPerSec: number, done: number, total: number): string | undefined {
    if (total > 0) this.totalBytes = total;
    // never let the shown amount exceed the package's own total size
    const bounded = this.totalBytes > 0 ? Math.min(done, this.totalBytes) : done;
    this.doneBytes = Math.max(this.doneBytes, bounded);
    return this.buildMessage(speedBytesPerSec);
  }

  private buildMessage(speedBytesPerSec: number): string | undefined {
    const knownBig = this.totalBytes >= this.minBytes;
    const unknownButBig = this.totalBytes === 0 && this.doneBytes >= this.minBytes;
    if (!knownBig && !unknownButBig) return undefined; // small package: stay quiet

    const speedText = `${formatBytes(Math.max(0, speedBytesPerSec))}/s`;
    const remain = this.totalBytes - this.doneBytes;
    const etaText = speedBytesPerSec > 0 && remain > 0
      ? `  ETA ${formatDuration(remain / speedBytesPerSec)}`
      : '';
    const sizeText = this.totalBytes > 0
      ? `${formatBytes(this.doneBytes)} / ${formatBytes(this.totalBytes)}`
      : formatBytes(this.doneBytes);
    // No percentage: the total is per-package and often only known for the
    // wheel currently being fetched, so a percentage would be misleading.
    return `⬇ ${speedText}  ${sizeText}${etaText}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Polls the byte size of the given directories every `intervalMs` and reports
 * the growth rate. Stop it with `stop()` when the install finishes.
 */
export class PipSizePoller {
  private stopped = false;
  private readonly done: Promise<void>;

  constructor(
    dirs: string[],
    onSample: (speedBytesPerSec: number, bytesOnDisk: number) => void,
    intervalMs = 2000
  ) {
    this.done = this.loop(dirs, onSample, intervalMs);
  }

  private async loop(
    dirs: string[],
    onSample: (speedBytesPerSec: number, bytesOnDisk: number) => void,
    intervalMs: number
  ): Promise<void> {
    let lastSize = 0;
    let lastTime = 0;
    while (!this.stopped) {
      await sleep(intervalMs);
      if (this.stopped) return;
      if (dirs.length === 0) continue;
      try {
        let total = 0;
        for (const dir of dirs) {
          if (!fs.existsSync(dir)) continue;
          total += await getDirectorySize(dir);
        }
        const now = Date.now();
        if (lastTime > 0 && total >= lastSize) {
          const speed = (total - lastSize) / ((now - lastTime) / 1000);
          onSample(speed, total);
        }
        lastSize = total;
        lastTime = now;
      } catch {
        // ignore poll errors and retry on the next tick
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.done;
  }
}
