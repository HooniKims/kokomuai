interface CurriculumRecommendationQueryInput {
  name: string;
  subject: string;
  topic: string;
  learningGoal: string;
}

export function buildCurriculumRecommendationQuery(input: CurriculumRecommendationQueryInput, fallbackTopic = ""): string {
  const query = [input.name, input.subject, input.topic, input.learningGoal]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" ");

  return query || fallbackTopic;
}
