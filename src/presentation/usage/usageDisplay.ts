import type { IdentityTeacherAccount } from "../../domain/identity/identityAccess.js";
import type { MonthlyUsageSummary } from "../../domain/usage/usageAccounting.js";

export interface UsageDisplayTotals {
  conversationCount: number;
  aiCallCount: number;
  errorCount: number;
  inputTokenEstimate: number;
  outputTokenEstimate: number;
  totalTokenEstimate: number;
  estimatedCostKrw: number;
}

export interface TeacherUsageDisplayRow extends UsageDisplayTotals {
  teacherId: string;
  teacherName: string;
  schoolName: string;
  status: IdentityTeacherAccount["status"];
}

export function summarizeUsageTotals(summaries: MonthlyUsageSummary[]): UsageDisplayTotals {
  const totals = summaries.reduce(
    (acc, summary) => ({
      conversationCount: acc.conversationCount + summary.conversationCount,
      aiCallCount: acc.aiCallCount + summary.aiCallCount,
      errorCount: acc.errorCount + summary.errorCount,
      inputTokenEstimate: acc.inputTokenEstimate + summary.inputTokenEstimate,
      outputTokenEstimate: acc.outputTokenEstimate + summary.outputTokenEstimate,
      estimatedCostKrw: acc.estimatedCostKrw + summary.estimatedCostKrw
    }),
    {
      conversationCount: 0,
      aiCallCount: 0,
      errorCount: 0,
      inputTokenEstimate: 0,
      outputTokenEstimate: 0,
      estimatedCostKrw: 0
    }
  );

  return {
    ...totals,
    totalTokenEstimate: totals.inputTokenEstimate + totals.outputTokenEstimate
  };
}

export function summarizeUsageByTeacher(
  teachers: IdentityTeacherAccount[],
  summaries: MonthlyUsageSummary[]
): TeacherUsageDisplayRow[] {
  return teachers.map((teacher) => {
    const totals = summarizeUsageTotals(summaries.filter((summary) => summary.teacherId === teacher.id));
    return {
      ...totals,
      teacherId: teacher.id,
      teacherName: teacher.realName || teacher.email,
      schoolName: teacher.school.schoolName,
      status: teacher.status
    };
  });
}

export function formatTokenCount(count: number): string {
  return Math.round(count).toLocaleString("ko-KR");
}

export function formatKrwCost(cost: number): string {
  return `${Math.round(cost).toLocaleString("ko-KR")}원`;
}
