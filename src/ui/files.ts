export const onlyGz = (files: File[]) =>
  files.filter((f) => /\.gz$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.name.localeCompare(b.name));

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

/** Collects .gz files from a drop, descending into dropped folders. */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  // Entries must be taken synchronously, before the first await, or the browser clears them.
  const entries = [...dt.items].map((item) => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return onlyGz([...dt.files]);
  const out: File[] = [];
  for (const e of entries) await walk(e, out);
  return onlyGz(out);
}
