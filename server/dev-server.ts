import http from "node:http";
import { createApiHandler } from "./apiHandler.js";
import { getFileBackedCurriculumIndex } from "./curriculumRepository.js";
import { createLocalStore } from "./localStore.js";
import { searchNeisSchools } from "./neisSchoolSearch.js";
import { loadDotEnvFile } from "./serverEnv.js";

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
