"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
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
        const registeredViews = vscode.window.treeViews;
        assert.ok(registeredViews !== undefined);
    });
});
//# sourceMappingURL=extension.test.js.map