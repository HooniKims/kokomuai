import type { ChatbotPolicyInput } from "../domain/chatbot/types";
import { buildCurriculumRecommendationQuery } from "./curriculumRecommendationQuery";

type ChatbotFormState = ChatbotPolicyInput & { name: string };

export interface CurriculumRecommendationState {
  query: string;
  schoolLevel: ChatbotPolicyInput["schoolLevel"];
  gradeBand: string;
  subject?: string;
}

export function resolveCurriculumRecommendationState(form: ChatbotFormState, sample: ChatbotFormState): CurriculumRecommendationState {
  const hasTextInput = [form.name, form.subject, form.topic, form.learningGoal].some((value) => value.trim().length > 0);
  const isUntouchedSampleScope = form.schoolLevel === sample.schoolLevel && form.gradeBand.trim() === "";
  const useSampleSubject = !hasTextInput && isUntouchedSampleScope;

  return {
    query: buildCurriculumRecommendationQuery(form, sample.topic),
    schoolLevel: form.schoolLevel,
    gradeBand: resolveGradeBand(form.schoolLevel, form.gradeBand, sample),
    subject: useSampleSubject ? sample.subject : normalizedOptional(form.subject)
  };
}

function resolveGradeBand(schoolLevel: ChatbotPolicyInput["schoolLevel"], gradeBand: string, sample: ChatbotFormState): string {
  const trimmed = gradeBand.trim();
  if (trimmed) return trimmed;
  if (schoolLevel === sample.schoolLevel) return sample.gradeBand;
  return schoolLevel === "vocational_high" ? "all" : sample.gradeBand;
}

function normalizedOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
