import http from "node:http";
import { createApiHandler } from "./apiHandler";
import { getFileBackedCurriculumIndex } from "./curriculumRepository";
import { createLocalStore } from "./localStore";
import { searchNeisSchools } from "./neisSchoolSearch";
import { loadDotEnvFile } from "./serverEnv";

loadDotEnvFile();

const port = Number(process.env.PORT ?? 8787);
const neisApiKey = process.env.NEIS_API_KEY ?? process.env.NEXT_PUBLIC_NEIS_API_KEY ?? "";
const curriculumIndex = await getFileBackedCurriculumIndex();
const localStore = createLocalStore();
const apiHandler = createApiHandler({
  store: localStore,
  curriculumIndex,
  schoolSearch: (query) => searchNeisSchools({ query, apiKey: neisApiKey }),
  env: process.env
});

const server = http.createServer(apiHandler);

server.listen(port, "127.0.0.1", () => {
  console.log(`Local API server listening on http://127.0.0.1:${port}`);
});
