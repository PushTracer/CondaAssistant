import * as path from 'path';
import * as fs from 'fs';

export function run(): Promise<void> {
  const testsRoot = __dirname;
  const mocha = new (require('mocha'))({ ui: 'tdd', color: true });
  return new Promise((resolve, reject) => {
    fs.readdir(testsRoot, (err, files) => {
      if (err) return reject(err);
      const testFiles = files.filter(f => f.endsWith('.test.js'));
      if (testFiles.length === 0) {
        reject(new Error(`未在 ${testsRoot} 找到测试文件`));
        return;
      }
      testFiles.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
      try {
        mocha.run((failures: number) => {
          if (failures > 0) reject(new Error(`${failures} tests failed.`));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}
