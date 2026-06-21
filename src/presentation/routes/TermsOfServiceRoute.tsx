import {
  footerCopyrightText,
  termsOfServiceSections,
} from "../legal/privacyPolicy.js";

export function TermsOfServiceRoute() {
  return (
    <section className="workspace privacy-workspace">
      <article className="dashboard-panel privacy-panel">
        {termsOfServiceSections.map((section, index) => (
          <section key={section.title} className="privacy-section">
            {index === 0 ? <span className="soft-label">꼬꼬무AI</span> : null}
            {index === 0 ? <h1>{section.title}</h1> : <h2>{section.title}</h2>}
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <p className="privacy-footer">{footerCopyrightText}</p>
      </article>
    </section>
  );
}
