import { LogIn, LogOut, Mail, School, UserPlus } from "lucide-react";
import type { SchoolSearchResult } from "../apiClient.js";
import { Eye, EyeOff } from "lucide-react";
import { canSubmitTeacherProfile } from "./teacherAuthForm.js";

export interface TeacherAuthPanelProps {
  realName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  showPassword: boolean;
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
  onPasswordConfirmationChange: (value: string) => void;
  onTogglePasswordVisibility: () => void;
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
  passwordConfirmation,
  showPassword,
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
  onPasswordConfirmationChange,
  onTogglePasswordVisibility,
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
  const passwordConfirmationState =
    passwordConfirmation.length === 0
      ? "empty"
      : password === passwordConfirmation
        ? "match"
        : "mismatch";
  const canUseEmailSignUp =
    canUseEmailAuth && passwordConfirmationState === "match";
  const statusText = authError || authStatus;

  return (
    <section className="workspace auth-workspace">
      <aside className="info-panel">
        <div className="panel-section">
          <span className="soft-label">교사 계정</span>
          <h2>
            학교 확인 후
            <br />
            사용할 수
            <br />
            있습니다.
          </h2>
          <p className={`auth-status ${authError ? "error" : ""}`}>
            {statusText}
          </p>
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
            <span className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                placeholder="8자 이상"
                onChange={(event) => onPasswordChange(event.target.value)}
                autoComplete="current-password"
              />
              <button
                aria-label={
                  showPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                }
                className="password-toggle"
                type="button"
                onClick={onTogglePasswordVisibility}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          <label>
            비밀번호 확인
            <span className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={passwordConfirmation}
                placeholder="가입할 때 한 번 더 입력"
                onChange={(event) =>
                  onPasswordConfirmationChange(event.target.value)
                }
                autoComplete="new-password"
              />
              <button
                aria-label={
                  showPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                }
                className="password-toggle"
                type="button"
                onClick={onTogglePasswordVisibility}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
            <small
              className={`password-match-note ${passwordConfirmationState}`}
            >
              {passwordConfirmationState === "empty"
                ? "가입할 때 비밀번호를 한 번 더 입력해 주세요."
                : passwordConfirmationState === "match"
                  ? "비밀번호가 일치합니다."
                  : "비밀번호가 일치하지 않습니다."}
            </small>
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
            disabled={!canUseEmailSignUp}
          >
            <Mail size={16} /> 이메일 가입
          </button>
          <button
            className="pill google-auth-button"
            type="button"
            onClick={() => void onGoogleSignIn()}
            disabled={isSubmitting}
          >
            <GoogleIcon /> Google로 계속하기
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

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="google-icon"
      viewBox="0 0 24 24"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
