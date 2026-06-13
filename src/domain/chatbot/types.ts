export type SchoolLevel = "elementary" | "middle" | "high" | "vocational_high";

export type HintStrength = "low" | "medium" | "high";

export interface ChatbotPolicyInput {
  schoolLevel: SchoolLevel;
  gradeBand: string;
  subject: string;
  topic: string;
  learningGoal: string;
  hintStrength: HintStrength;
  persona: string;
}
