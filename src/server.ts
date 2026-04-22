import {
  createConnection,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextEdit,
  type DocumentFormattingParams,
} from "vscode-languageserver/node.js";

import { TextDocument } from "vscode-languageserver-textdocument";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// fallback：如果工作区本地没有 prettier，就用 server 自带依赖
import * as bundledPrettier from "prettier";

const connection = createConnection(ProposedFeatures.all);
const documents = new Map<string, TextDocument>();

connection.onInitialize(() => {
  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Incremental,
        save: { includeText: false },
      },
      documentFormattingProvider: true
    },
  };
});

connection.onInitialized(() => {
  connection.console.log("Prettier formatter LSP initialized.");
});

/** ===== 文档同步（内存副本） ===== */
connection.onDidOpenTextDocument((params) => {
  const doc = TextDocument.create(
    params.textDocument.uri,
    params.textDocument.languageId,
    params.textDocument.version,
    params.textDocument.text
  );
  documents.set(params.textDocument.uri, doc);
});

connection.onDidChangeTextDocument((params) => {
  const old = documents.get(params.textDocument.uri);
  if (!old) return;
  const updated = TextDocument.update(old, params.contentChanges, params.textDocument.version);
  documents.set(params.textDocument.uri, updated);
});

connection.onDidCloseTextDocument((params) => {
  documents.delete(params.textDocument.uri);
});

connection.onDidSaveTextDocument((params) => {
  connection.console.log(`didSave: ${params.textDocument.uri}`);
});

/** ===== 工具函数 ===== */
function uriToFsPath(uri: string): string {
  if (uri.startsWith("file://")) {
    const u = decodeURIComponent(uri.replace("file://", ""));
    return process.platform === "win32" && u.startsWith("/") ? u.slice(1) : u;
  }
  return uri;
}

function fullDocumentRange(doc: TextDocument) {
  const text = doc.getText();
  const end = doc.positionAt(text.length);
  return { start: { line: 0, character: 0 }, end };
}

/**
 * 从 filePath 所在目录开始，优先加载本地 prettier（node_modules/prettier）。
 * 找不到就回退到 bundledPrettier
 */
async function loadPrettierPreferLocal(filePath: string): Promise<any> {
  try {
    const basedir = path.dirname(filePath);
    const req = createRequire(path.join(basedir, "__prettier_resolve__.cjs"));
    const resolved = req.resolve("prettier");
    const mod = await import(pathToFileURL(resolved).toString());
    return mod?.default ?? mod;
  } catch {
    connection.console.warn('failed to load local Prettier, fallback to bundled Prettier');
    return bundledPrettier;
  }
}

async function prettierFormatText(opts: { uri: string; input: string }): Promise<string | null> {
  const filePath = uriToFsPath(opts.uri);
  const prettier = await loadPrettierPreferLocal(filePath);

  const [config, info] = await Promise.all([
    prettier.resolveConfig(filePath).catch(() => null),
    prettier.getFileInfo(filePath).catch(() => null),
  ]);

  const parser = info?.inferredParser ?? undefined;
  if (!parser) return null;

  const formatted = await prettier.format(opts.input, {
    ...(config ?? {}),
    parser,
    filepath: filePath,
  });

  return formatted;
}

/** ===== 全文格式化 ===== */
connection.onDocumentFormatting(async (params: DocumentFormattingParams): Promise<TextEdit[]> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const input = doc.getText();

  try {
    const formatted = await prettierFormatText({
      uri: params.textDocument.uri,
      input,
    });

    if (formatted == null || formatted === input) return [];
    return [TextEdit.replace(fullDocumentRange(doc), formatted)];
  } catch (e: any) {
    connection.console.error(`Prettier formatting failed: ${e?.message ?? String(e)}`);
    return [];
  }
});

connection.listen();
