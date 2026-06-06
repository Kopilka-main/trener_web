/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { PluginObj, types as BabelTypes } from '@babel/core';

// Уникальный id сборки. Встраивается в бандл (__APP_BUILD_ID__) и пишется в
// /version.json — клиент сверяет их и предлагает обновиться при новой версии.
const BUILD_ID = String(Date.now());

function versionFile(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: BUILD_ID }),
      });
    },
  };
}

// Babel-плагин: на каждый host-JSX-элемент (имя с маленькой буквы — div/button/...)
// проставляет data-loc="<relpath>:<line>" с путём от src/ и строкой открывающего тега.
// Строковый литерал переживает минификацию, поэтому работает и в прод-сборке.
function dataLocBabel({ types: t }: { types: typeof BabelTypes }): PluginObj {
  return {
    name: 'data-loc',
    visitor: {
      JSXOpeningElement(path, state) {
        const nameNode = path.node.name;
        if (nameNode.type !== 'JSXIdentifier') return;
        if (!/^[a-z]/.test(nameNode.name)) return; // только host-элементы
        const hasLoc = path.node.attributes.some(
          (a) =>
            a.type === 'JSXAttribute' &&
            a.name.type === 'JSXIdentifier' &&
            a.name.name === 'data-loc',
        );
        if (hasLoc) return;
        const loc = path.node.loc;
        if (!loc) return;
        const filename = state.file.opts.filename ?? '';
        const norm = filename.replace(/\\/g, '/');
        const i = norm.lastIndexOf('/src/');
        const rel = i === -1 ? norm : norm.slice(i + 1); // 'src/...'
        path.node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier('data-loc'), t.stringLiteral(`${rel}:${loc.start.line}`)),
        );
      },
    },
  };
}

export default defineConfig(({ command }) => ({
  define: { __APP_BUILD_ID__: JSON.stringify(BUILD_ID) },
  // data-loc нужен только dev-инспектору (DevInspector) — в прод-сборку не включаем.
  plugins: [
    react({ babel: { plugins: command === 'serve' ? [dataLocBabel] : [] } }),
    tailwindcss(),
    versionFile(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
