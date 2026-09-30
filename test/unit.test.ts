import * as assert from 'assert';
import { formatBytes, parseByteAmount } from '../src/util/format';
import { parseCondaEnvList } from '../src/util/parse';

suite('工具函数单元测试', () => {
  test('formatBytes 应按单位换算', () => {
    assert.strictEqual(formatBytes(0), '0 B');
    assert.strictEqual(formatBytes(512), '512 B');
    assert.strictEqual(formatBytes(1024), '1 KB');
    assert.strictEqual(formatBytes(1536), '1.5 KB');
    assert.strictEqual(formatBytes(1024 * 1024), '1 MB');
    assert.strictEqual(formatBytes(5 * 1024 ** 3), '5 GB');
  });

  test('formatBytes 应处理非法输入', () => {
    assert.strictEqual(formatBytes(-1), '0 B');
    assert.strictEqual(formatBytes(Number.NaN), '0 B');
  });

  test('parseByteAmount 应按单位换算并容忍非法输入', () => {
    assert.strictEqual(parseByteAmount('512', 'B'), 512);
    assert.strictEqual(parseByteAmount('1', 'KB'), 1024);
    assert.strictEqual(parseByteAmount('1.5', 'MB'), 1.5 * 1024 ** 2);
    assert.strictEqual(parseByteAmount('2', 'G'), 2 * 1024 ** 3);
    // 单位缺失按字节处理
    assert.strictEqual(parseByteAmount('10', ''), 10);
    // 非法数值不产生 NaN
    assert.strictEqual(parseByteAmount('abc', 'MB'), 0);
  });

  test('parseCondaEnvList 应解析环境并跳过注释行', () => {
    const output = [
      '# conda environments:',
      '#',
      'base                  *  /home/user/miniconda3',
      'myenv                    /home/user/miniconda3/envs/myenv',
      '',
    ].join('\n');
    const envs = parseCondaEnvList(output);
    assert.strictEqual(envs.length, 2);
    assert.strictEqual(envs[0].name, 'base');
    assert.strictEqual(envs[0].active, true);
    assert.strictEqual(envs[0].path, '/home/user/miniconda3');
    assert.strictEqual(envs[1].name, 'myenv');
    assert.strictEqual(envs[1].active, false);
    assert.strictEqual(envs[1].path, '/home/user/miniconda3/envs/myenv');
  });
});
