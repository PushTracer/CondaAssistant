import * as assert from 'assert';
import {
  LIVE_PROGRESS_MIN_BYTES,
  PipDownloadTracker,
  parseCondaFrame,
} from '../src/ai/pipProgress';

suite('下载进度解析', () => {
  test('parseCondaFrame 应解析带进度条的帧', () => {
    const frame = parseCondaFrame('openssl-3.0.17 | 5.2 MB | ######8 | 68%');
    assert.ok(frame, '未解析出帧');
    assert.strictEqual(frame!.name, 'openssl-3.0.17');
    assert.strictEqual(frame!.percent, '68');
    assert.ok(frame!.bytes > 4 * 1024 * 1024 && frame!.bytes < 6 * 1024 * 1024);
  });

  test('parseCondaFrame 应解析无进度条的帧，并忽略普通行', () => {
    const frame = parseCondaFrame('numpy-2.1.0 | 12.3 MB    5%');
    assert.ok(frame);
    assert.strictEqual(frame!.percent, '5');
    assert.strictEqual(parseCondaFrame('Solving environment: ...'), undefined);
  });

  test('大包下载应产生进度消息且回显行', () => {
    const tracker = new PipDownloadTracker();
    const start = tracker.handleLine('Downloading torch-2.5.1-cp312-cp312-win_amd64.whl (780.4 MB)');
    assert.strictEqual(start.showLine, true);
    assert.ok(start.message && start.message.includes('780.4 MB'), `实际: ${start.message}`);

    const frame = tracker.handleLine('45.2/780.4 MB 3.2 MB/s eta 0:04:00');
    assert.strictEqual(frame.showLine, true);
    assert.ok(frame.message && frame.message.includes('45.2 MB / 780.4 MB'), `实际: ${frame.message}`);
    assert.ok(frame.message && !frame.message.includes('%'), `不应显示百分比: ${frame.message}`);
  });

  test('小包下载不应产生进度消息', () => {
    const tracker = new PipDownloadTracker();
    const start = tracker.handleLine('Downloading six-1.16.0-py2.py3-none-any.whl (11 kB)');
    assert.strictEqual(start.showLine, true);
    assert.strictEqual(start.message, undefined);

    const frame = tracker.handleLine('0.005/0.011 MB 1.2 MB/s');
    assert.strictEqual(frame.showLine, false);
    assert.strictEqual(frame.message, undefined);
  });

  test('普通行应原样回显且不产生进度', () => {
    const tracker = new PipDownloadTracker();
    const result = tracker.handleLine('Collecting numpy>=1.26');
    assert.strictEqual(result.showLine, true);
    assert.strictEqual(result.message, undefined);
    assert.strictEqual(result.torchUnavailable, false);
  });

  test('应识别 torch 轮子缺失', () => {
    const tracker = new PipDownloadTracker();
    const result = tracker.handleLine(
      'ERROR: Could not find a version that satisfies the requirement torch (from versions: none)'
    );
    assert.strictEqual(result.torchUnavailable, true);
  });

  test('handleByteSample 在大包采样时才输出消息', () => {
    const tracker = new PipDownloadTracker();
    // 首个采样只用于建立基线，不输出
    assert.strictEqual(tracker.handleByteSample(1024, 1024), undefined);
    // 磁盘字节数增量超过阈值后开始显示
    const message = tracker.handleByteSample(2 * 1024 * 1024, LIVE_PROGRESS_MIN_BYTES + 4096);
    assert.ok(message, '应产生进度消息');
    assert.ok(message!.includes('/s'), `实际: ${message}`);
  });

  test('磁盘采样只统计当前包的增量，且不超过总大小', () => {
    const tracker = new PipDownloadTracker();
    tracker.handleLine('Downloading torch-2.5.1-cp312-cp312-win_amd64.whl (780.4 MB)');
    // 缓存里已有其他包的 wheel，累计 1.3 GB
    const cacheWithOtherPackages = 1.3 * 1024 ** 3;
    assert.strictEqual(tracker.handleByteSample(0, cacheWithOtherPackages), undefined);
    const message = tracker.handleByteSample(5 * 1024 * 1024, cacheWithOtherPackages + 200 * 1024 ** 2) as string;
    assert.ok(message, '应产生进度消息');
    assert.ok(message.includes('200 MB / 780.4 MB'), `实际: ${message}`);
    assert.ok(!message.includes('1.3 GB'), `不应包含累计值: ${message}`);
  });
});
