import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function unescape(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

function extractL10nKeys(): string[] {
  const keys = new Set<string>();
  const scan = (code: string): void => {
    const re = /vscode\.l10n\.t\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      keys.add(unescape(match[1] !== undefined ? match[1] : match[2]));
    }
  };
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith('.js')) scan(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(path.join(ROOT, 'out', 'src'));
  return [...keys].sort();
}

suite('本地化资源测试', () => {
  test('英文 l10n bundle 应覆盖所有 l10n.t 文案且无空值', () => {
    const bundle = readJson(path.join('l10n', 'bundle.l10n.en.json'));
    const keys = extractL10nKeys();
    assert.ok(keys.length > 0, '未从编译产物中提取到任何 l10n.t 文案');
    for (const key of keys) {
      assert.ok(key in bundle, `缺少英文翻译: ${key}`);
      assert.ok(bundle[key].trim().length > 0, `英文翻译为空: ${key}`);
    }
  });

  test('package.nls 中英文键集合应一致', () => {
    const zh = readJson('package.nls.json');
    const en = readJson('package.nls.en.json');
    assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  });

  test('package.json 的 %占位符% 应在两个 nls 文件中均有定义', () => {
    const zh = readJson('package.nls.json');
    const en = readJson('package.nls.en.json');
    const pkgText = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const placeholders = new Set<string>();
    const re = /%([A-Za-z0-9._-]+)%/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(pkgText)) !== null) {
      placeholders.add(match[1]);
    }
    assert.ok(placeholders.size > 0, '未在 package.json 中找到 NLS 占位符');
    for (const key of placeholders) {
      assert.ok(key in zh, `package.nls.json 缺少: ${key}`);
      assert.ok(key in en, `package.nls.en.json 缺少: ${key}`);
    }
  });
});
