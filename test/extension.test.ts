import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Conda AI Manager Test Suite', () => {
  test('插件应正确激活', async () => {
    const ext = vscode.extensions.getExtension('conda-ai-manager');
    assert.ok(ext);
    if (!ext?.isActive) {
      await ext?.activate();
    }
    assert.strictEqual(ext?.isActive, true);
  });

  test('应注册所有命令', async () => {
    const commands = await vscode.commands.getCommands();
    const expected = [
      'conda-ai.refresh',
      'conda-ai.createEnvironment',
      'conda-ai.deleteEnvironment',
      'conda-ai.activateEnvironment',
      'conda-ai.quickCreate',
      'conda-ai.healthCheck',
      'conda-ai.selectInterpreter',
      'conda-ai.exportEnvironment',
      'conda-ai.importEnvironment'
    ];
    for (const cmd of expected) {
      assert.ok(commands.includes(cmd), `命令 ${cmd} 未注册`);
    }
  });

  test('应注册 TreeView', async () => {
    const registeredViews = (vscode as any).window.treeViews;
    assert.ok(registeredViews !== undefined);
  });
});
