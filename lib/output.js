import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './utils.js';

export function isWithin(parent, file) {
  const rel = path.relative(parent, file);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}

// realpath 也适用于尚不存在的输出目录，防止父目录的符号链接绕过检查。
async function realDestination(file) {
  try {
    return await fs.realpath(file);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return path.join(await realDestination(path.dirname(file)), path.basename(file));
  }
}

export async function assertSafeOutput(outDir, root = ROOT) {
  const output = path.resolve(outDir);
  const actual = await realDestination(output);
  const realRoot = await fs.realpath(root);
  const protectedPaths = ['posts', 'pages', 'static', 'theme', 'lib', 'test', 'tests', 'node_modules', '.git', '.github', '.agents', '.codex'];
  if (isWithin(actual, realRoot)) throw new Error(`不安全的输出目录：${output}（项目根目录或祖先目录）`);
  for (const name of protectedPaths) {
    const source = await realDestination(path.join(realRoot, name));
    if (isWithin(source, actual) || isWithin(actual, source)) {
      throw new Error(`不安全的输出目录：${output}（与源码目录 ${name} 重叠）`);
    }
  }
  try {
    const stat = await fs.lstat(output);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`输出目录必须是普通目录：${output}`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return output;
}

/** 所有产物共用一份文件清单，连文件/目录同名及大小写冲突也提前检查。 */
export class OutputPlan {
  files = new Map();
  keys = new Map();

  add(rel, entry) {
    if (path.posix.isAbsolute(rel) || rel.split('/').some((part) => !part || part === '.' || part === '..') || rel.includes('\\')) {
      throw new Error(`非法输出路径：${rel}`);
    }
    const key = rel.normalize('NFC').toLowerCase();
    for (const [other, previous] of this.keys) {
      if (key === other || key.startsWith(`${other}/`) || other.startsWith(`${key}/`)) {
        throw new Error(`输出路径冲突：${entry.owner} → ${rel}；${previous.owner} → ${previous.rel}`);
      }
    }
    this.keys.set(key, { owner: entry.owner, rel });
    this.files.set(rel, entry);
  }

  async copyTree(dir, prefix = '', { markdown = false } = {}) {
    let entries;
    try {
      if ((await fs.lstat(dir)).isSymbolicLink()) throw new Error(`资源不能是符号链接：${dir}`);
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const ent of entries) {
      if (/^[._]/.test(ent.name) || (markdown && /\.md$/i.test(ent.name))) continue;
      const src = path.join(dir, ent.name);
      const rel = prefix + ent.name;
      if (ent.isSymbolicLink()) throw new Error(`资源不能是符号链接：${src}`);
      if (ent.isDirectory()) await this.copyTree(src, `${rel}/`, { markdown });
      else if (ent.isFile()) this.add(rel, { source: src, owner: src });
    }
  }

  async publish(outDir) {
    // 所有检查、渲染均完成后才创建 staging；旧产物在失败时保留。
    await assertSafeOutput(outDir);
    const parent = path.dirname(outDir);
    await fs.mkdir(parent, { recursive: true });
    const stage = await fs.mkdtemp(path.join(parent, `.${path.basename(outDir)}-build-`));
    let backup;
    let moved = false;
    try {
      for (const [rel, entry] of this.files) {
        const file = path.join(stage, rel);
        await fs.mkdir(path.dirname(file), { recursive: true });
        if (entry.source) await fs.copyFile(entry.source, file);
        else await fs.writeFile(file, entry.content);
      }
      await assertSafeOutput(outDir);
      try {
        await fs.lstat(outDir);
        backup = await fs.mkdtemp(path.join(parent, `.${path.basename(outDir)}-backup-`));
        await fs.rename(outDir, path.join(backup, 'previous'));
        moved = true;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      try {
        await fs.rename(stage, outDir);
      } catch (err) {
        if (moved) await fs.rename(path.join(backup, 'previous'), outDir);
        throw err;
      }
      if (backup) {
        try { await fs.rm(backup, { recursive: true, force: true }); }
        catch (err) { console.warn(`产物已更新，旧备份清理失败（保留于 ${backup}）：${err.message}`); }
      }
    } finally {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
}
