const schoolLevelLabels: Record<string, string> = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  vocational_high: "직업계고",
  vocationalHigh: "직업계고",
  "vocational-high": "직업계고",
  special: "특수학급",
  specialClass: "특수학급",
  special_class: "특수학급",
  "special-class": "특수학급",
  specialEducation: "특수교육",
  special_education: "특수교육",
  "special-education": "특수교육",
  kindergarten: "유치원",
  all: "전체 학교급"
};

export function formatSchoolLevelLabel(schoolLevel: string): string {
  return schoolLevelLabels[schoolLevel] ?? schoolLevel;
}
