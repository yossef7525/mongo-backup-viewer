import { isDumpInput, type PathEntry } from '../archive/dirDump';

const byPath = (a: PathEntry, b: PathEntry) => a.path.localeCompare(b.path, 'en', { sensitivity: 'base' }) || a.path.localeCompare(b.path);

export const sortEntries = (entries: PathEntry[]) => [...entries].sort(byPath);

/** Folder walks keep archives and directory-dump parts only, since unrelated files are expected there. */
const keepFromFolder = (entries: PathEntry[]) => sortEntries(entries.filter((e) => isDumpInput(e.file.name)));

/**
 * Entries from an <input type="file">. Picked files all pass through (the worker reports non-archives);
 * a picked folder (webkitdirectory) keeps only archives and dump parts, with their paths relative to the parent of that folder.
 */
export function entriesFromPicker(files: File[], folder: boolean): PathEntry[] {
  const entries = files.map((file) => ({ file, path: (folder && file.webkitRelativePath) || file.name }));
  return folder ? keepFromFolder(entries) : sortEntries(entries);
}

async function walk(entry: FileSystemEntry, prefix: string, out: PathEntry[]): Promise<void> {
  const path = prefix + entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ file, path });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child, `${path}/`, out);
    }
  }
}

/** Collects a drop: dropped files as-is, plus the archives and dump parts inside dropped folders (paths start at the dropped folder). */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<PathEntry[]> {
  // Entries must be taken synchronously, before the first await, or the browser clears them.
  const entries = [...dt.items].map((item) => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return entriesFromPicker([...dt.files], false);
  const picked: PathEntry[] = [];
  const inFolders: PathEntry[] = [];
  for (const e of entries) await walk(e, '', e.isDirectory ? inFolders : picked);
  return [...sortEntries(picked), ...keepFromFolder(inFolders)];
}
