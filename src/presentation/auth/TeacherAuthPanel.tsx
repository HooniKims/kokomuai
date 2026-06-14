import {
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  School,
  UserPlus,
} from "lucide-react";
import type { SchoolSearchResult } from "../apiClient.js";
import { canSubmitTeacherProfile } from "./teacherAuthForm.js";

export type AuthPanelMode = "login" | "signup";

export interface TeacherAuthPanelProps {
  mode: AuthPanelMode;
  isSignedIn: boolean;
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
  onModeChange: (mode: AuthPanelMode) => void;
  onRealNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordConfirmationChange: (value: string) => void;
  onTogglePasswordVisibility: () => void;
  onSchoolQueryChange: (value: string) => void;
  onSelectSchool: (school: SchoolSearchResult) => void;
  onEmailSignIn: () => void | Promise<void>;
  onGoogleSignIn: () => void | Promise<void>;
  onRegisterProfile: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}

export function TeacherAuthPanel({
  mode,
  isSignedIn,
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
  onModeChange,
  onRealNameChange,
  onEmailChange,
  onPasswordChange,
  onPasswordConfirmationChange,
  onTogglePasswordVisibility,
  onSchoolQueryChange,
  onSelectSchool,
  onEmailSignIn,
  onGoogleSignIn,
  onRegisterProfile,
  onSignOut,
}: TeacherAuthPanelProps) {
  const isSignup = mode === "signup";
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
  const canSubmitSignupRequest =
    canSubmitTeacherProfile({ realName, email, selectedSchool }) &&
    !isSubmitting &&
    (isSignedIn || canUseEmailSignUp);
  const statusText = authError || authStatus;
  const isSubmittedSignupStatus =
    !authError && statusText.includes("가입 요청이 접수됐습니다");
  const statusClassName = [
    "auth-status",
    authError ? "error" : "",
    isSubmittedSignupStatus ? "success" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={`workspace auth-workspace ${
        isSignup ? "auth-workspace-signup" : "auth-workspace-login"
      }`}
      aria-busy={isSubmitting}
    >
      {isSubmitting ? (
        <div
          className="auth-loading-overlay"
          data-action="auth-loading-overlay"
          role="status"
          aria-live="polite"
        >
          <div className="auth-loading-message">
            <strong>잠시만 기다려 주세요.</strong>
            <span>로그인 정보를 확인하고 있습니다.</span>
          </div>
        </div>
      ) : null}
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
          <p className={statusClassName}>{statusText}</p>
        </div>
        <div className="notice">
          <strong>{isSignup ? "가입 기준" : "로그인 안내"}</strong>
          <p>
            {isSignup
              ? "학교는 직접 입력하지 않고 NEIS 검색 결과에서 선택해야 합니다."
              : "가입이 승인된 계정은 로그인 후 권한에 맞는 화면으로 이동합니다."}
          </p>
        </div>
      </aside>

      <section className="dashboard-panel auth-panel">
        <div className="section-heading">
          <div>
            <span className="soft-label">
              {isSignup ? "가입 신청" : "로그인"}
            </span>
            <h2>
              {isSignup ? "학교 확인을 신청합니다" : "교사 계정으로 로그인"}
            </h2>
          </div>
          {isSignedIn ? (
            <button
              className="pill outline"
              type="button"
              onClick={() => void onSignOut()}
              disabled={isSubmitting}
            >
              <LogOut size={16} /> 로그아웃
            </button>
          ) : null}
        </div>

        {isSignup ? (
          <SignupForm
            realName={realName}
            email={email}
            password={password}
            passwordConfirmation={passwordConfirmation}
            showPassword={showPassword}
            passwordConfirmationState={passwordConfirmationState}
            onRealNameChange={onRealNameChange}
            onEmailChange={onEmailChange}
            onPasswordChange={onPasswordChange}
            onPasswordConfirmationChange={onPasswordConfirmationChange}
            onTogglePasswordVisibility={onTogglePasswordVisibility}
            isSubmitting={isSubmitting}
          />
        ) : (
          <LoginForm
            email={email}
            password={password}
            showPassword={showPassword}
            onEmailChange={onEmailChange}
            onPasswordChange={onPasswordChange}
            onTogglePasswordVisibility={onTogglePasswordVisibility}
            onEmailSignIn={onEmailSignIn}
            onGoogleSignIn={onGoogleSignIn}
            onModeChange={onModeChange}
            canUseEmailAuth={canUseEmailAuth}
            isSubmitting={isSubmitting}
          />
        )}

        {isSignup ? (
          <>
            <SchoolSearchPanel
              schoolQuery={schoolQuery}
              schoolResults={schoolResults}
              selectedSchool={selectedSchool}
              isSearchingSchools={isSearchingSchools}
              onSchoolQueryChange={onSchoolQueryChange}
              onSelectSchool={onSelectSchool}
              isSubmitting={isSubmitting}
            />

            {authError ? (
              <p className="admin-log auth-error">{authError}</p>
            ) : null}
            <button
              className="pill dark auth-submit"
              data-action="register-profile"
              type="button"
              onClick={() => void onRegisterProfile()}
              disabled={!canSubmitSignupRequest}
            >
              <UserPlus size={16} /> 가입 요청
            </button>
          </>
        ) : authError ? (
          <p className="admin-log auth-error">{authError}</p>
        ) : null}
      </section>
    </section>
  );
}

interface PasswordVisibilityProps {
  showPassword: boolean;
  onTogglePasswordVisibility: () => void;
}

function LoginForm({
  email,
  password,
  showPassword,
  onEmailChange,
  onPasswordChange,
  onTogglePasswordVisibility,
  onEmailSignIn,
  onGoogleSignIn,
  onModeChange,
  canUseEmailAuth,
  isSubmitting,
}: Pick<TeacherAuthPanelProps, "email" | "password"> &
  PasswordVisibilityProps & {
    onEmailChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onEmailSignIn: () => void | Promise<void>;
    onGoogleSignIn: () => void | Promise<void>;
    onModeChange: (mode: AuthPanelMode) => void;
    canUseEmailAuth: boolean;
    isSubmitting: boolean;
  }) {
  return (
    <form
      data-action="email-login-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canUseEmailAuth) void onEmailSignIn();
      }}
    >
      <div className="form-grid auth-form-grid login-form-grid">
        <label>
          이메일
          <input
            type="email"
            value={email}
            placeholder="teacher@example.com"
            onChange={(event) => onEmailChange(event.target.value)}
            autoComplete="email"
            disabled={isSubmitting}
          />
        </label>
        <label>
          비밀번호
          <PasswordInput
            value={password}
            placeholder="8자 이상"
            showPassword={showPassword}
            autoComplete="current-password"
            onChange={onPasswordChange}
            onTogglePasswordVisibility={onTogglePasswordVisibility}
            disabled={isSubmitting}
          />
        </label>
      </div>
      <div className="auth-actions">
        <button
          className="pill dark"
          data-action="email-login"
          type="submit"
          disabled={!canUseEmailAuth}
        >
          <LogIn size={16} /> 이메일 로그인
        </button>
        <button
          className="pill google-auth-button"
          data-action="google-login"
          type="button"
          onClick={() => void onGoogleSignIn()}
          disabled={isSubmitting}
        >
          <GoogleIcon /> Google로 계속하기
        </button>
        <button
          className="pill outline auth-mode-link"
          data-action="switch-signup"
          type="button"
          onClick={() => onModeChange("signup")}
          disabled={isSubmitting}
        >
          회원가입
        </button>
      </div>
    </form>
  );
}

function SignupForm({
  realName,
  email,
  password,
  passwordConfirmation,
  showPassword,
  passwordConfirmationState,
  onRealNameChange,
  onEmailChange,
  onPasswordChange,
  onPasswordConfirmationChange,
  onTogglePasswordVisibility,
  isSubmitting,
}: Pick<
  TeacherAuthPanelProps,
  "realName" | "email" | "password" | "passwordConfirmation"
> &
  PasswordVisibilityProps & {
    passwordConfirmationState: "empty" | "match" | "mismatch";
    onRealNameChange: (value: string) => void;
    onEmailChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onPasswordConfirmationChange: (value: string) => void;
    isSubmitting: boolean;
  }) {
  return (
    <div className="form-grid auth-form-grid signup-form-grid">
      <label>
        이름
        <input
          value={realName}
          placeholder="김하늘"
          onChange={(event) => onRealNameChange(event.target.value)}
          autoComplete="name"
          disabled={isSubmitting}
        />
      </label>
      <label>
        이메일
        <input
          type="email"
          value={email}
          placeholder="teacher@example.com"
          onChange={(event) => onEmailChange(event.target.value)}
          autoComplete="email"
          disabled={isSubmitting}
        />
      </label>
      <label>
        비밀번호
        <PasswordInput
          value={password}
          placeholder="8자 이상"
          showPassword={showPassword}
          autoComplete="new-password"
          onChange={onPasswordChange}
          onTogglePasswordVisibility={onTogglePasswordVisibility}
          disabled={isSubmitting}
        />
      </label>
      <label>
        비밀번호 확인
        <PasswordInput
          value={passwordConfirmation}
          placeholder="한 번 더 입력"
          showPassword={showPassword}
          autoComplete="new-password"
          onChange={onPasswordConfirmationChange}
          onTogglePasswordVisibility={onTogglePasswordVisibility}
          disabled={isSubmitting}
        />
        <small className={`password-match-note ${passwordConfirmationState}`}>
          {passwordConfirmationState === "empty"
            ? "가입할 때 비밀번호를 한 번 더 입력해 주세요."
            : passwordConfirmationState === "match"
              ? "비밀번호가 일치합니다."
              : "비밀번호가 일치하지 않습니다."}
        </small>
      </label>
    </div>
  );
}

function PasswordInput({
  value,
  placeholder,
  showPassword,
  autoComplete,
  onChange,
  onTogglePasswordVisibility,
  disabled = false,
}: PasswordVisibilityProps & {
  value: string;
  placeholder: string;
  autoComplete: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <span className="password-field">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
      />
      <button
        aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
        className="password-toggle"
        type="button"
        tabIndex={-1}
        onClick={onTogglePasswordVisibility}
        disabled={disabled}
      >
        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  );
}

function SchoolSearchPanel({
  schoolQuery,
  schoolResults,
  selectedSchool,
  isSearchingSchools,
  onSchoolQueryChange,
  onSelectSchool,
  isSubmitting,
}: Pick<
  TeacherAuthPanelProps,
  | "schoolQuery"
  | "schoolResults"
  | "selectedSchool"
  | "isSearchingSchools"
  | "onSchoolQueryChange"
  | "onSelectSchool"
> & {
  isSubmitting: boolean;
}) {
  return (
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
          disabled={isSubmitting}
        />
      </label>
      {isSearchingSchools ? (
        <p className="selected-school-note">학교 목록을 불러오는 중입니다.</p>
      ) : null}

      <div className="school-result-list">
        {schoolResults.map((school) => {
          const isSelected =
            selectedSchool?.standardSchoolCode === school.standardSchoolCode;
          return (
            <button
              aria-pressed={isSelected}
              className={`school-result ${isSelected ? "selected" : ""}`}
              key={`${school.officeCode}-${school.standardSchoolCode}`}
              onClick={() => onSelectSchool(school)}
              type="button"
              disabled={isSubmitting}
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
