import { LogIn, LogOut, Mail, School, UserPlus } from "lucide-react";
import type { SchoolSearchResult } from "../apiClient";
import { canSubmitTeacherProfile } from "./teacherAuthForm";

export interface TeacherAuthPanelProps {
  realName: string;
  email: string;
  password: string;
  schoolQuery: string;
  schoolResults: SchoolSearchResult[];
  selectedSchool: SchoolSearchResult | null;
  isSearchingSchools: boolean;
  isSubmitting: boolean;
  authStatus: string;
  authError: string;
  onRealNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSchoolQueryChange: (value: string) => void;
  onSelectSchool: (school: SchoolSearchResult) => void;
  onEmailSignIn: () => void | Promise<void>;
  onEmailSignUp: () => void | Promise<void>;
  onGoogleSignIn: () => void | Promise<void>;
  onRegisterProfile: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}

export function TeacherAuthPanel({
  realName,
  email,
  password,
  schoolQuery,
  schoolResults,
  selectedSchool,
  isSearchingSchools,
  isSubmitting,
  authStatus,
  authError,
  onRealNameChange,
  onEmailChange,
  onPasswordChange,
  onSchoolQueryChange,
  onSelectSchool,
  onEmailSignIn,
  onEmailSignUp,
  onGoogleSignIn,
  onRegisterProfile,
  onSignOut,
}: TeacherAuthPanelProps) {
  const canRegisterProfile =
    canSubmitTeacherProfile({ realName, email, selectedSchool }) &&
    !isSubmitting;
  const canUseEmailAuth =
    email.trim().length > 0 && password.length >= 8 && !isSubmitting;

  return (
    <section className="workspace auth-workspace">
      <aside className="info-panel">
        <div className="panel-section">
          <span className="soft-label">교사 계정</span>
          <h2>학교 확인 후 사용할 수 있습니다.</h2>
          <p>{authStatus}</p>
        </div>
        <div className="notice">
          <strong>가입 기준</strong>
          <p>학교는 직접 입력하지 않고 NEIS 검색 결과에서 선택해야 합니다.</p>
        </div>
      </aside>

      <section className="dashboard-panel auth-panel">
        <div className="section-heading">
          <div>
            <span className="soft-label">가입 및 로그인</span>
            <h2>교사 계정으로 시작하기</h2>
          </div>
          <button
            className="pill outline"
            type="button"
            onClick={() => void onSignOut()}
            disabled={isSubmitting}
          >
            <LogOut size={16} /> 로그아웃
          </button>
        </div>

        <div className="form-grid auth-form-grid">
          <label>
            이름
            <input
              value={realName}
              placeholder="김하늘"
              onChange={(event) => onRealNameChange(event.target.value)}
            />
          </label>
          <label>
            이메일
            <input
              type="email"
              value={email}
              placeholder="teacher@example.com"
              onChange={(event) => onEmailChange(event.target.value)}
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              placeholder="8자 이상"
              onChange={(event) => onPasswordChange(event.target.value)}
              autoComplete="current-password"
            />
          </label>
        </div>

        <div className="auth-actions">
          <button
            className="pill dark"
            type="button"
            onClick={() => void onEmailSignIn()}
            disabled={!canUseEmailAuth}
          >
            <LogIn size={16} /> 이메일 로그인
          </button>
          <button
            className="pill outline"
            type="button"
            onClick={() => void onEmailSignUp()}
            disabled={!canUseEmailAuth}
          >
            <Mail size={16} /> 이메일 가입
          </button>
          <button
            className="pill outline"
            type="button"
            onClick={() => void onGoogleSignIn()}
            disabled={isSubmitting}
          >
            <UserPlus size={16} /> Google로 계속하기
          </button>
        </div>

        <div className="school-search-panel">
          <div className="section-heading compact">
            <div>
              <span className="soft-label">학교 선택</span>
              <h2>학교명을 일부 입력한 뒤 목록에서 선택해 주세요.</h2>
            </div>
          </div>
          <label className="school-query-label">
            학교명
            <input
              value={schoolQuery}
              placeholder="예: 등촌중"
              onChange={(event) => onSchoolQueryChange(event.target.value)}
            />
          </label>
          {isSearchingSchools ? (
            <p className="selected-school-note">
              학교 목록을 불러오는 중입니다.
            </p>
          ) : null}

          <div className="school-result-list">
            {schoolResults.map((school) => {
              const isSelected =
                selectedSchool?.standardSchoolCode ===
                school.standardSchoolCode;
              return (
                <button
                  aria-pressed={isSelected}
                  className={`school-result ${isSelected ? "selected" : ""}`}
                  key={`${school.officeCode}-${school.standardSchoolCode}`}
                  onClick={() => onSelectSchool(school)}
                  type="button"
                >
                  <School size={18} aria-hidden="true" />
                  <span>
                    <strong>{school.schoolName}</strong>
                    <small>
                      {[school.region, school.schoolKind, school.address]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>

          {selectedSchool ? (
            <p className="selected-school-note">
              선택한 학교: {selectedSchool.schoolName}
              {selectedSchool.address ? ` · ${selectedSchool.address}` : ""}
            </p>
          ) : (
            <p className="selected-school-note">
              학교를 직접 입력하지 말고 아래 목록에서 선택해 주세요.
            </p>
          )}
        </div>

        {authError ? <p className="admin-log auth-error">{authError}</p> : null}
        <button
          className="pill dark auth-submit"
          data-action="register-profile"
          type="button"
          onClick={() => void onRegisterProfile()}
          disabled={!canRegisterProfile}
        >
          <UserPlus size={16} /> 학교 선택 후 가입 요청
        </button>
      </section>
    </section>
  );
}
