import { describe, expect, it } from "vitest";
import { searchNeisSchools } from "../../server/neisSchoolSearch";

describe("searchNeisSchools", () => {
  it("maps NEIS schoolInfo rows to selectable school records", async () => {
    const schools = await searchNeisSchools({
      query: "새빛중",
      apiKey: "test-key",
      fetchImpl: async (url) => {
        expect(String(url)).toContain("schoolInfo");
        expect(String(url)).toContain("SCHUL_NM=%EC%83%88%EB%B9%9B%EC%A4%91");
        return new Response(
          JSON.stringify({
            schoolInfo: [
              { head: [{ list_total_count: 1 }, { RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." } }] },
              {
                row: [
                  {
                    SCHUL_NM: "새빛중학교",
                    SCHUL_KND_SC_NM: "중학교",
                    ATPT_OFCDC_SC_CODE: "B10",
                    SD_SCHUL_CODE: "1234567",
                    LCTN_SC_NM: "서울특별시",
                    ORG_RDNMA: "서울특별시 중구 예시로 1"
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    });

    expect(schools).toEqual([
      {
        schoolName: "새빛중학교",
        schoolKind: "중학교",
        officeCode: "B10",
        standardSchoolCode: "1234567",
        region: "서울특별시",
        address: "서울특별시 중구 예시로 1"
      }
    ]);
  });

  it("rejects direct empty searches to reduce API calls", async () => {
    await expect(
      searchNeisSchools({
        query: "  ",
        apiKey: "test-key",
        fetchImpl: async () => {
          throw new Error("fetch must not be called");
        }
      })
    ).resolves.toEqual([]);
  });

  it("requires a server-side NEIS API key", async () => {
    await expect(
      searchNeisSchools({
        query: "새빛중",
        apiKey: "",
        fetchImpl: async () => new Response("{}", { status: 200 })
      })
    ).rejects.toThrow("NEIS API key is required");
  });
});
