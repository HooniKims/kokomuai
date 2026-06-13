import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCurriculumIndex, type CurriculumIndex } from "./curriculumIndex";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultDocumentsDir = join(projectRoot, "2022_Revised_National_Curriculum", "documents");

let cachedIndex: CurriculumIndex | undefined;

export async function getFileBackedCurriculumIndex(documentsDir = defaultDocumentsDir): Promise<CurriculumIndex> {
  if (documentsDir === defaultDocumentsDir && cachedIndex) {
    return cachedIndex;
  }

  const entries = await readdir(documentsDir, { withFileTypes: true });
  const sources = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map(async (entry) => ({
        markdown: await readFile(join(documentsDir, entry.name), "utf8"),
        sourceTitle: entry.name
      }))
  );
  const index = buildCurriculumIndex(sources);

  if (documentsDir === defaultDocumentsDir) {
    cachedIndex = index;
  }

  return index;
}
