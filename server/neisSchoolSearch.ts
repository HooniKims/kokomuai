import type { IdentitySchool } from "../src/domain/identity/identityAccess.js";

export interface NeisSchool extends IdentitySchool {
  address: string;
}

export interface SearchNeisSchoolsInput {
  query: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface NeisSchoolRow {
  SCHUL_NM?: string;
  SCHUL_KND_SC_NM?: string;
  ATPT_OFCDC_SC_CODE?: string;
  SD_SCHUL_CODE?: string;
  LCTN_SC_NM?: string;
  ORG_RDNMA?: string;
}

interface NeisSchoolInfoResponse {
  schoolInfo?: Array<{
    row?: NeisSchoolRow[];
  }>;
}

export async function searchNeisSchools(input: SearchNeisSchoolsInput): Promise<NeisSchool[]> {
  const query = input.query.trim();
  if (!query) return [];

  if (!input.apiKey.trim()) {
    throw new Error("NEIS API key is required");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const url = new URL("https://open.neis.go.kr/hub/schoolInfo");
  url.searchParams.set("KEY", input.apiKey);
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", "1");
  url.searchParams.set("pSize", "10");
  url.searchParams.set("SCHUL_NM", query);

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`NEIS school search failed: ${response.status}`);
  }

  const payload = (await response.json()) as NeisSchoolInfoResponse;
  const rows = payload.schoolInfo?.flatMap((entry) => entry.row ?? []) ?? [];
  return rows.map(toNeisSchool).filter((school) => school.schoolName && school.standardSchoolCode);
}

function toNeisSchool(row: NeisSchoolRow): NeisSchool {
  return {
    schoolName: row.SCHUL_NM?.trim() ?? "",
    schoolKind: row.SCHUL_KND_SC_NM?.trim() ?? "",
    officeCode: row.ATPT_OFCDC_SC_CODE?.trim() ?? "",
    standardSchoolCode: row.SD_SCHUL_CODE?.trim() ?? "",
    region: row.LCTN_SC_NM?.trim() ?? "",
    address: row.ORG_RDNMA?.trim() ?? ""
  };
}
