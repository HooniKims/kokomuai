export type SchoolLevel = "elementary" | "middle" | "high" | "vocational_high";

export type HintStrength = "low" | "medium" | "high";
export type QuestionLevel = "easy" | "medium" | "hard";

export interface ChatbotPolicyInput {
  schoolLevel: SchoolLevel;
  gradeBand: string;
  subject: string;
  topic: string;
  learningGoal: string;
  hintStrength: HintStrength;
  questionLevel?: QuestionLevel;
  persona: string;
}
