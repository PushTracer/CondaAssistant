import * as path from 'path';
import * as fs from 'fs';

export function run(): Promise<void> {
  const testsRoot = path.resolve(__dirname, '..');
  const mocha = new (require('mocha'))({ ui: 'tdd', color: true });
  return new Promise((resolve, reject) => {
    fs.readdir(testsRoot, (err, files) => {
      if (err) return reject(err);
      const testFiles = files.filter(f => f.endsWith('.test.js'));
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
