import * as assert from 'assert';
import * as vscode from 'vscode';
import { CONFIG_DEFAULTS } from '../src/core/config';

const EXTENSION_IDS = ['pushtracer.conda-assistant', 'conda-assistant'];

const EXPECTED_COMMANDS = [
  'conda-assistant.refresh',
  'conda-assistant.createEnvironment',
  'conda-assistant.deleteEnvironment',
  'conda-assistant.activateEnvironment',
  'conda-assistant.quickCreate',
  'conda-assistant.healthCheck',
  'conda-assistant.analyzeEnvironment',
  'conda-assistant.exportEnvironment',
  'conda-assistant.importEnvironment',
  'conda-assistant.switchInterpreter',
  'conda-assistant.selectInterpreter',
  'conda-assistant.installPackage',
  'conda-assistant.uninstallPackage',
  'conda-assistant.showPackageDeps',
  'conda-assistant.cloneEnvironment',
  'conda-assistant.renameEnvironment',
  'conda-assistant.detectConflict',
  'conda-assistant.scanWSL',
  'conda-assistant.openWSLTerminal',
  'conda-assistant.diskDiagnose',
  'conda-assistant.cleanCache',
];

suite('CondaAssistant 集成测试', () => {
  test('扩展应成功激活', async () => {
    const ext = EXTENSION_IDS
      .map(id => vscode.extensions.getExtension(id))
      .find(candidate => candidate !== undefined);
    assert.ok(ext, '未找到 CondaAssistant 扩展');
    if (!ext.isActive) {
      await ext.activate();
    }
    assert.strictEqual(ext.isActive, true);
  });

  test('所有命令应已注册', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of EXPECTED_COMMANDS) {
      assert.ok(commands.includes(command), `命令未注册: ${command}`);
    }
  });

  test('配置项默认值应可读取', () => {
    const config = vscode.workspace.getConfiguration('conda-assistant');
    for (const [key, expected] of Object.entries(CONFIG_DEFAULTS)) {
      assert.deepStrictEqual(config.get(key), expected, `配置项 ${key} 的默认值不正确`);
    }
  });
});
