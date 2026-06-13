export type HeroView = "student" | "teacher" | "admin";

const heroDescription = "질문과 대화를 통해 스스로 알아가는, 여러분을 위한 공간입니다.";

export function getHeroDescription(view: HeroView): string {
  void view;
  return heroDescription;
}
