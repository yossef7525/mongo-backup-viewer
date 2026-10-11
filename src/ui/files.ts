const byName = (a: File, b: File) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.name.localeCompare(b.name);

/** Sorts files by name; explicitly picked or dropped files all pass through (the worker reports non-archives). */
export const sortFiles = (files: File[]) => [...files].sort(byName);

/** Keeps only .gz files, sorted: used for folder walks, where unrelated files are expected. */
export const onlyGz = (files: File[]) => sortFiles(files.filter((f) => /\.gz$/i.test(f.name)));

async function walk(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    out.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)));
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

/** Collects files from a drop: dropped files as-is, plus the .gz files inside dropped folders. */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  // Entries must be taken synchronously, before the first await, or the browser clears them.
  const entries = [...dt.items].map((item) => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return sortFiles([...dt.files]);
  const picked: File[] = [];
  const inFolders: File[] = [];
  for (const e of entries) await walk(e, e.isDirectory ? inFolders : picked);
  return [...sortFiles(picked), ...onlyGz(inFolders)];
}
