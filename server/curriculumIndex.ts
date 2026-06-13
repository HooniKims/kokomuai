export interface CurriculumMarkdownSource {
  markdown: string;
  sourceTitle?: string;
  subject?: string;
}

export type CurriculumSchoolLevel = "elementary" | "middle" | "high" | "vocational_high" | "all";

export interface CurriculumIndexChunk {
  id: string;
  sourceTitle: string;
  schoolLevel: CurriculumSchoolLevel;
  gradeBand: string;
  subject: string;
  area: string;
  achievement: string;
  excerpt: string;
  sectionPath: string;
}

export interface CurriculumRecommendationCandidate extends CurriculumIndexChunk {
  chunkId: string;
  matchedTerms: string[];
  score: number;
}

export interface CurriculumIndex {
  chunks: CurriculumIndexChunk[];
  search(topic: string): CurriculumRecommendationCandidate[];
}

interface ParsedFrontMatter {
  korean_title?: string;
  source_file?: string;
  category?: string;
}

interface GradeContext {
  label: string;
  schoolLevel: CurriculumSchoolLevel;
  gradeBand: string;
}

interface PendingAchievement {
  code: string;
  lines: string[];
  sourceTitle: string;
  subject: string;
  area: string;
  grade: GradeContext;
  sectionPath: string;
}

export function buildCurriculumIndex(sources: CurriculumMarkdownSource[]): CurriculumIndex {
  const chunks = sources.flatMap((source) => parseCurriculumSource(source));

  return {
    chunks,
    search: (topic) => searchCurriculumChunks(chunks, topic)
  };
}

function parseCurriculumSource(source: CurriculumMarkdownSource): CurriculumIndexChunk[] {
  const frontMatter = parseFrontMatter(source.markdown);
  const sourceTitle = source.sourceTitle ?? frontMatter.source_file ?? firstMarkdownHeading(source.markdown) ?? "Untitled curriculum source";
  const subject = source.subject ?? inferSubject(frontMatter.korean_title ?? sourceTitle, frontMatter.category);
  const sourceGrade = frontMatter.category === "professional_subject"
    ? { label: "직업계고 전문교과", schoolLevel: "vocational_high" as const, gradeBand: "all" }
    : { label: "", schoolLevel: "all" as const, gradeBand: "all" };
  const chunks: CurriculumIndexChunk[] = [];
  const headingStack: string[] = [];
  let grade: GradeContext = sourceGrade;
  let area = "";
  let pending: PendingAchievement | undefined;

  const flushPending = () => {
    if (!pending) return;

    const excerpt = normalizeInlineText(pending.lines.join(" "));
    chunks.push({
      id: `${slugify(pending.sourceTitle)}:${pending.code}`,
      sourceTitle: pending.sourceTitle,
      schoolLevel: pending.grade.schoolLevel,
      gradeBand: pending.grade.gradeBand,
      subject: pending.subject,
      area: pending.area,
      achievement: `[${pending.code}] ${excerpt}`,
      excerpt,
      sectionPath: pending.sectionPath
    });
    pending = undefined;
  };

  for (const rawLine of source.markdown.split(/\r?\n/)) {
    const line = rawLine.trim();

    const heading = parseMarkdownHeading(line);
    if (heading) {
      flushPending();
      headingStack.splice(heading.level - 1, headingStack.length, heading.title);
      continue;
    }

    const nextGrade = parseGradeHeading(line);
    if (nextGrade) {
      flushPending();
      grade = nextGrade;
      continue;
    }

    const nextArea = parseAreaHeading(line);
    if (nextArea) {
      flushPending();
      area = nextArea;
      continue;
    }

    const achievement = parseAchievementLine(line);
    if (achievement) {
      flushPending();
      const inferredGrade = inferGradeFromAchievementCode(achievement.code);
      const achievementGrade = sourceGrade.schoolLevel === "vocational_high"
        ? sourceGrade
        : inferredGrade.schoolLevel === "all" ? grade : inferredGrade;
      pending = {
        code: achievement.code,
        lines: [achievement.text],
        sourceTitle,
        subject,
        area,
        grade: achievementGrade,
        sectionPath: buildSectionPath(headingStack, achievementGrade.label, area)
      };
      continue;
    }

    if (pending && line && !isAchievementBoundary(line)) {
      pending.lines.push(line);
      continue;
    }

    if (pending) {
      flushPending();
    }
  }

  flushPending();

  return chunks;
}

function searchCurriculumChunks(
  chunks: CurriculumIndexChunk[],
  topic: string
): CurriculumRecommendationCandidate[] {
  const terms = tokenize(topic);

  if (terms.length === 0) {
    return [];
  }

  return chunks
    .map((chunk) => {
      const primaryText = `${chunk.achievement} ${chunk.excerpt}`;
      const contextText = `${chunk.sourceTitle} ${chunk.subject} ${chunk.area} ${chunk.sectionPath}`;
      const primaryTerms = new Set(tokenize(primaryText));
      const contextTerms = new Set(tokenize(contextText));
      const primaryNormalized = normalizeForSearch(primaryText);
      const contextNormalized = normalizeForSearch(contextText);
      const scoredTerms = terms
        .map((term) => {
          if (primaryTerms.has(term)) return { term, score: 3 };
          if (primaryNormalized.includes(term)) return { term, score: 2 };
          if (contextTerms.has(term) || contextNormalized.includes(term)) return { term, score: 1 };
          return { term, score: 0 };
        })
        .filter((termScore) => termScore.score > 0);
      const score = scoredTerms.reduce((sum, termScore) => sum + termScore.score, 0);

      return {
        ...chunk,
        chunkId: chunk.id,
        matchedTerms: scoredTerms.map((termScore) => termScore.term),
        score
      };
    })
    .filter((candidate) => candidate.score >= 2)
    .sort((a, b) => b.score - a.score || a.sectionPath.localeCompare(b.sectionPath, "ko"));
}

function parseFrontMatter(markdown: string): ParsedFrontMatter {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  return match[1].split(/\r?\n/).reduce<ParsedFrontMatter>((frontMatter, line) => {
    const item = line.match(/^([A-Za-z_]+):\s*(.+)$/);
    if (!item) return frontMatter;

    const key = item[1] as keyof ParsedFrontMatter;
    if (key === "korean_title" || key === "source_file" || key === "category") {
      frontMatter[key] = stripQuotes(item[2].trim());
    }

    return frontMatter;
  }, {});
}

function firstMarkdownHeading(markdown: string): string | undefined {
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = parseMarkdownHeading(rawLine.trim());
    if (heading) return heading.title;
  }

  return undefined;
}

function parseMarkdownHeading(line: string): { level: number; title: string } | undefined {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return undefined;

  return {
    level: match[1].length,
    title: normalizeInlineText(match[2])
  };
}

function parseGradeHeading(line: string): GradeContext | undefined {
  const match = line.match(/^\[(초등학교|중학교|고등학교)(?:\s*([0-9]+)\s*[~∼-]\s*([0-9]+)학년|(?:\s*([0-9]+)학년)?)?\]$/);
  if (!match) return undefined;

  const label = line.slice(1, -1);
  const gradeBand = match[2] && match[3] ? `${match[2]}-${match[3]}` : match[4] ?? "all";

  return {
    label,
    schoolLevel: toSchoolLevel(match[1]),
    gradeBand
  };
}

function parseAreaHeading(line: string): string | undefined {
  const match = line.match(/^\([0-9]+\)\s+(.+)$/);
  if (!match) return undefined;

  return normalizeInlineText(match[1]);
}

function parseAchievementLine(line: string): { code: string; text: string } | undefined {
  const match = line.match(/^\[([0-9A-Za-z가-힣]+(?:\s+[0-9A-Za-z가-힣]+)?(?:-[0-9A-Za-z가-힣]+)+)\]\s*(.+)$/);
  if (!match) return undefined;

  return {
    code: match[1],
    text: normalizeInlineText(match[2])
  };
}

function isAchievementBoundary(line: string): boolean {
  return (
    parseMarkdownHeading(line) !== undefined ||
    parseGradeHeading(line) !== undefined ||
    parseAreaHeading(line) !== undefined ||
    parseAchievementLine(line) !== undefined ||
    /^[(（][가-힣A-Za-z][)）]/.test(line) ||
    /^<.+>$/.test(line) ||
    /^[-•]\s+\[[0-9A-Za-z가-힣]+(?:\s+[0-9A-Za-z가-힣]+)?(?:-[0-9A-Za-z가-힣]+)+\]/.test(line)
  );
}

function buildSectionPath(headingStack: string[], gradeLabel: string, area: string): string {
  return [...headingStack, gradeLabel, area].filter(Boolean).join(" > ");
}

function inferSubject(title: string, category?: string): string {
  const cleaned = title
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\.pdf$/i, "")
    .replace(/교육과정/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (category === "professional_subject") {
    return cleaned;
  }

  const subject = cleaned.split(" ").find((part) => part.endsWith("과")) ?? cleaned.split(" ")[0] ?? cleaned;

  return subject.endsWith("과") && subject.length > 1 ? subject.slice(0, -1) : subject;
}

function toSchoolLevel(label: string): CurriculumSchoolLevel {
  if (label === "초등학교") return "elementary";
  if (label === "중학교") return "middle";
  if (label === "고등학교") return "high";
  return "all";
}

function inferGradeFromAchievementCode(code: string): GradeContext {
  const match = /^([0-9]+)/.exec(code);
  const prefix = match ? Number(match[1]) : 0;

  if (prefix <= 2) {
    return { label: "초등학교 1~2학년", schoolLevel: "elementary", gradeBand: "1-2" };
  }
  if (prefix <= 4) {
    return { label: "초등학교 3~4학년", schoolLevel: "elementary", gradeBand: "3-4" };
  }
  if (prefix <= 6) {
    return { label: "초등학교 5~6학년", schoolLevel: "elementary", gradeBand: "5-6" };
  }
  if (prefix <= 9) {
    return { label: "중학교 1~3학년", schoolLevel: "middle", gradeBand: "1-3" };
  }
  if (prefix >= 10) {
    return { label: "고등학교", schoolLevel: "high", gradeBand: "all" };
  }

  return { label: "", schoolLevel: "all", gradeBand: "all" };
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      normalizeForSearch(text)
        .split(/[^0-9a-z가-힣]+/i)
        .flatMap(expandSearchTerm)
        .map(stripKoreanParticle)
        .filter((term) => term.length >= 2 && !isLowSignalSearchTerm(term))
    )
  );
}

function normalizeForSearch(text: string): string {
  return normalizeInlineText(text).toLowerCase();
}

function stripKoreanParticle(term: string): string {
  return term.replace(/(으로|에서|에게|과|와|을|를|은|는|이|가|에|의|로)$/u, "");
}

function expandSearchTerm(term: string): string[] {
  const terms = [term];
  const withoutLeadingNumber = term.replace(/^\d+(?=[가-힣])/, "");
  if (withoutLeadingNumber !== term) {
    terms.push(withoutLeadingNumber);
  }

  return terms;
}

function isLowSignalSearchTerm(term: string): boolean {
  return /^(대한|이해|학습|주제|중\d+|초\d+|고\d+)$/u.test(term);
}

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripQuotes(value: string): string {
  return value.replace(/^["'`](.*)["'`]$/, "$1");
}

function slugify(value: string): string {
  return normalizeForSearch(value).replace(/[^0-9a-z가-힣]+/gi, "-").replace(/^-+|-+$/g, "");
}
