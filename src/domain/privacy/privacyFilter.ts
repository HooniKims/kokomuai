export type PrivacyRiskType = "phone" | "email" | "address" | "studentNumber";

export interface PrivacyRisk {
  type: PrivacyRiskType;
  match: string;
}

export interface PrivacyDetectionResult {
  blocked: boolean;
  risks: PrivacyRisk[];
}

const patterns: Array<{ type: PrivacyRiskType; pattern: RegExp }> = [
  { type: "phone", pattern: /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g },
  { type: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { type: "address", pattern: /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(특별시|광역시|시|도)?\s+[가-힣]+(시|군|구)/g },
  { type: "studentNumber", pattern: /(학번|번호)\s*(은|는|:)?\s*\d{4,12}/g }
];

export function detectPrivacyRisks(text: string): PrivacyDetectionResult {
  const risks: PrivacyRisk[] = [];

  for (const { type, pattern } of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[0]) {
        risks.push({ type, match: match[0] });
      }
    }
  }

  return {
    blocked: risks.length > 0,
    risks
  };
}

