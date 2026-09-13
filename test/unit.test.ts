import * as assert from 'assert';
import { formatBytes } from '../src/util/format';
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
