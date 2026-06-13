import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clientForbiddenEnvNames, contentReferencesEnvName } from "../../scripts/productionPreflight";

describe("client secret exposure guard", () => {
  it("does not reference server-only environment names from client source files", async () => {
    const files = await listFiles("src");
    const sourceFiles = files.filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const content = await readFile(file, "utf8");
      for (const envName of clientForbiddenEnvNames) {
        if (contentReferencesEnvName(content, envName)) {
          violations.push(`${file}: ${envName}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const fullPath = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(fullPath) : Promise.resolve([fullPath]);
    })
  );

  return nested.flat();
}
