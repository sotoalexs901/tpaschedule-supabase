// src/pages/PassengerFeedbackPage.jsx

import React, { useState } from "react";
import { useParams } from "react-router-dom";

const MIN_FEEDBACK_DATE = "2026-07-01";

const ACCOUNT_CONFIG = {
  wchr: {
    key: "wchr",
    label: "WCHR",
    subtitle: {
      en: "Wheelchair Assistance",
      es: "Asistencia de silla de ruedas",
      pt: "Assistência de cadeira de rodas",
    },
  },
  "sun-country": {
    key: "sun-country",
    label: "Sun Country",
    subtitle: {
      en: "Passenger Service",
      es: "Servicio al pasajero",
      pt: "Atendimento ao passageiro",
    },
  },
  "world-atlantic": {
    key: "world-atlantic",
    label: "World Atlantic",
    subtitle: {
      en: "Passenger Service",
      es: "Servicio al pasajero",
      pt: "Atendimento ao passageiro",
    },
  },
};

const COPY = {
  en: {
    title: "How was your experience today?",
    intro: "Your feedback helps us recognize great service and improve the passenger experience.",
    serviceDate: "Service Date",
    serviceDateHelp: "You may select a service date back to July 1, 2026.",
    passengerName: "Passenger Name",
    passengerNamePlaceholder: "Your name",
    flightNumber: "Flight Number",
    flightNumberPlaceholder: "Example: SY123",
    pnr: "PNR / Confirmation Code",
    pnrPlaceholder: "Optional",
    employeeFirstName: "First name of the employee who assisted you",
    employeeFirstNamePlaceholder: "Example: Maria",
    employeeHelp: "First name only. If you do not remember it, you may leave this blank.",
    rating: "How would you rate your service?",
    courteous: "Was the employee courteous and professional?",
    assistance: "Did you receive the assistance you needed?",
    recommend: "Would you recommend our service?",
    comments: "Additional comments",
    commentsPlaceholder: "Optional — tell us anything else about your experience.",
    contactQuestion: "Would you like us to contact you about this feedback?",
    contactHelp: "If yes, provide an email address or phone number. You may provide both.",
    email: "Email",
    emailPlaceholder: "name@example.com",
    phone: "Phone Number",
    phonePlaceholder: "Phone number",
    excellent: "Excellent",
    good: "Good",
    fair: "Fair",
    poor: "Poor",
    yes: "Yes",
    partially: "Partially",
    no: "No",
    submit: "Submit Feedback",
    submitting: "Submitting...",
    required: "Please complete the required questions before submitting.",
    contactRequired: "Please provide at least an email address or phone number so we can contact you.",
    invalidDate: "Please select a service date between July 1, 2026 and today.",
    submitError: "We could not submit your feedback. Please try again.",
    thanksTitle: "Thank you for your feedback!",
    thanksBody: "Your comments help us provide better service.",
    another: "Submit another response",
    privacy: "Your feedback is reviewed by authorized AeroStation Hub management.",
    ratingLabels: ["Very poor", "Poor", "Fair", "Good", "Excellent"],
  },
  es: {
    title: "¿Cómo fue su experiencia hoy?",
    intro: "Sus comentarios nos ayudan a reconocer un buen servicio y mejorar la experiencia del pasajero.",
    serviceDate: "Fecha del servicio",
    serviceDateHelp: "Puede seleccionar una fecha de servicio desde el 1 de julio de 2026.",
    passengerName: "Nombre del pasajero",
    passengerNamePlaceholder: "Su nombre",
    flightNumber: "Número de vuelo",
    flightNumberPlaceholder: "Ejemplo: SY123",
    pnr: "PNR / Código de confirmación",
    pnrPlaceholder: "Opcional",
    employeeFirstName: "Primer nombre del empleado que le atendió",
    employeeFirstNamePlaceholder: "Ejemplo: Maria",
    employeeHelp: "Solo el primer nombre. Si no lo recuerda, puede dejarlo en blanco.",
    rating: "¿Cómo calificaría el servicio recibido?",
    courteous: "¿El empleado fue cortés y profesional?",
    assistance: "¿Recibió la asistencia que necesitaba?",
    recommend: "¿Recomendaría nuestro servicio?",
    comments: "Comentarios adicionales",
    commentsPlaceholder: "Opcional — cuéntenos cualquier otro detalle de su experiencia.",
    contactQuestion: "¿Desea que le contactemos acerca de este feedback?",
    contactHelp: "Si responde sí, agregue un correo electrónico o teléfono. Puede agregar ambos.",
    email: "Correo electrónico",
    emailPlaceholder: "nombre@ejemplo.com",
    phone: "Número de teléfono",
    phonePlaceholder: "Número de teléfono",
    excellent: "Excelente",
    good: "Bueno",
    fair: "Regular",
    poor: "Deficiente",
    yes: "Sí",
    partially: "Parcialmente",
    no: "No",
    submit: "Enviar comentarios",
    submitting: "Enviando...",
    required: "Complete las preguntas requeridas antes de enviar.",
    contactRequired: "Agregue al menos un correo electrónico o número de teléfono para poder contactarle.",
    invalidDate: "Seleccione una fecha de servicio entre el 1 de julio de 2026 y hoy.",
    submitError: "No pudimos enviar sus comentarios. Inténtelo nuevamente.",
    thanksTitle: "¡Gracias por sus comentarios!",
    thanksBody: "Sus comentarios nos ayudan a brindar un mejor servicio.",
    another: "Enviar otra respuesta",
    privacy: "Su feedback será revisado por personal autorizado de AeroStation Hub.",
    ratingLabels: ["Muy deficiente", "Deficiente", "Regular", "Bueno", "Excelente"],
  },
  pt: {
    title: "Como foi sua experiência hoje?",
    intro: "Seu feedback nos ajuda a reconhecer um ótimo atendimento e melhorar a experiência do passageiro.",
    serviceDate: "Data do serviço",
    serviceDateHelp: "Você pode selecionar uma data de serviço desde 1º de julho de 2026.",
    passengerName: "Nome do passageiro",
    passengerNamePlaceholder: "Seu nome",
    flightNumber: "Número do voo",
    flightNumberPlaceholder: "Exemplo: SY123",
    pnr: "PNR / Código de confirmação",
    pnrPlaceholder: "Opcional",
    employeeFirstName: "Primeiro nome do funcionário que atendeu você",
    employeeFirstNamePlaceholder: "Exemplo: Maria",
    employeeHelp: "Somente o primeiro nome. Se não lembrar, pode deixar em branco.",
    rating: "Como você avaliaria o serviço recebido?",
    courteous: "O funcionário foi cortês e profissional?",
    assistance: "Você recebeu a assistência de que precisava?",
    recommend: "Você recomendaria nosso serviço?",
    comments: "Comentários adicionais",
    commentsPlaceholder: "Opcional — conte-nos qualquer outro detalhe sobre sua experiência.",
    contactQuestion: "Você gostaria que entrássemos em contato sobre este feedback?",
    contactHelp: "Se sim, informe um e-mail ou telefone. Você pode informar ambos.",
    email: "E-mail",
    emailPlaceholder: "nome@exemplo.com",
    phone: "Número de telefone",
    phonePlaceholder: "Número de telefone",
    excellent: "Excelente",
    good: "Bom",
    fair: "Regular",
    poor: "Ruim",
    yes: "Sim",
    partially: "Parcialmente",
    no: "Não",
    submit: "Enviar feedback",
    submitting: "Enviando...",
    required: "Preencha as perguntas obrigatórias antes de enviar.",
    contactRequired: "Informe pelo menos um e-mail ou número de telefone para que possamos entrar em contato.",
    invalidDate: "Selecione uma data de serviço entre 1º de julho de 2026 e hoje.",
    submitError: "Não foi possível enviar seu feedback. Tente novamente.",
    thanksTitle: "Obrigado pelo seu feedback!",
    thanksBody: "Seus comentários nos ajudam a oferecer um serviço melhor.",
    another: "Enviar outra resposta",
    privacy: "Seu feedback será analisado pela gerência autorizada do AeroStation Hub.",
    ratingLabels: ["Muito ruim", "Ruim", "Regular", "Bom", "Excelente"],
  },
};

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function detectLanguage() {
  if (typeof navigator === "undefined") return "en";
  const language = String(navigator.language || "").toLowerCase();
  if (language.startsWith("es")) return "es";
  if (language.startsWith("pt")) return "pt";
  return "en";
}

function inputStyle() {
  return {
    width: "100%",
    minHeight: 50,
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: 14,
    padding: "10px 12px",
    fontSize: 16,
    color: "#0f172a",
    background: "#ffffff",
    outline: "none",
  };
}

function ChoiceButton({ selected, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 48,
        width: "100%",
        borderRadius: 14,
        border: selected ? "2px solid #1769aa" : "1px solid #cbd5e1",
        background: selected ? "#eaf5ff" : "#ffffff",
        color: selected ? "#0f4c81" : "#334155",
        fontSize: 14,
        fontWeight: 800,
        padding: "11px 12px",
        cursor: "pointer",
        boxSizing: "border-box",
      }}
    >
      {children}
    </button>
  );
}

function QuestionCard({ label, children }) {
  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 20,
        padding: 16,
        boxShadow: "0 12px 28px rgba(15,23,42,0.05)",
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 850,
          color: "#0f172a",
          lineHeight: 1.4,
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      {children}
    </section>
  );
}

export default function PassengerFeedbackPage() {
  const { account: rawAccount } = useParams();
  const account = ACCOUNT_CONFIG[String(rawAccount || "").toLowerCase()];
  const today = localToday();

  const [language, setLanguage] = useState(detectLanguage);
  const [serviceDate, setServiceDate] = useState(today);
  const [passengerName, setPassengerName] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [pnr, setPnr] = useState("");
  const [employeeFirstName, setEmployeeFirstName] = useState("");
  const [rating, setRating] = useState(0);
  const [courteous, setCourteous] = useState("");
  const [assistance, setAssistance] = useState("");
  const [recommend, setRecommend] = useState("");
  const [comments, setComments] = useState("");
  const [contactRequested, setContactRequested] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const t = COPY[language] || COPY.en;

  if (!account) {
    return (
      <main style={{ padding: 24, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
        <div style={{ maxWidth: 560, margin: "60px auto", textAlign: "center" }}>
          <h1 style={{ color: "#0f172a" }}>Feedback link unavailable</h1>
          <p style={{ color: "#64748b" }}>Please scan the QR code provided by our team.</p>
        </div>
      </main>
    );
  }

  const resetForm = () => {
    setServiceDate(localToday());
    setPassengerName("");
    setFlightNumber("");
    setPnr("");
    setEmployeeFirstName("");
    setRating(0);
    setCourteous("");
    setAssistance("");
    setRecommend("");
    setComments("");
    setContactRequested("");
    setContactEmail("");
    setContactPhone("");
    setError("");
    setSubmitted(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (serviceDate < MIN_FEEDBACK_DATE || serviceDate > today) {
      setError(t.invalidDate);
      return;
    }

    if (!rating || !courteous || !assistance || !recommend || !contactRequested) {
      setError(t.required);
      return;
    }

    if (
      contactRequested === "yes" &&
      !contactEmail.trim() &&
      !contactPhone.trim()
    ) {
      setError(t.contactRequired);
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch("/.netlify/functions/passenger-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: account.key,
          serviceDate,
          passengerName: passengerName.trim(),
          flightNumber: flightNumber.trim(),
          pnr: pnr.trim(),
          employeeFirstName: employeeFirstName.trim(),
          rating,
          courteous,
          assistance,
          recommend,
          comments: comments.trim(),
          contactRequested: contactRequested === "yes",
          contactEmail: contactRequested === "yes" ? contactEmail.trim() : "",
          contactPhone: contactRequested === "yes" ? contactPhone.trim() : "",
          language,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok !== true) {
        throw new Error(data?.error || "Feedback submission failed.");
      }

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Passenger feedback submit failed:", err);
      setError(t.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #eef7ff 0%, #f8fbff 42%, #ffffff 100%)",
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        padding:
          "max(14px, env(safe-area-inset-top)) 14px max(24px, env(safe-area-inset-bottom))",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 620, margin: "0 auto" }}>
        <header
          style={{
            borderRadius: 24,
            background: "linear-gradient(135deg, #061f3d 0%, #0f4c81 55%, #1769aa 100%)",
            color: "#ffffff",
            padding: "20px 18px",
            boxShadow: "0 18px 42px rgba(23,105,170,0.20)",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src="/icons/aerostation-icon.png"
              alt="AeroStation Hub"
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: "#ffffff",
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                AeroStation Hub · Passenger Feedback
              </div>
              <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900, lineHeight: 1.1 }}>
                {account.label}
              </div>
              <div style={{ marginTop: 3, fontSize: 13, color: "rgba(255,255,255,0.82)" }}>
                {account.subtitle[language]}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            {[
              ["en", "English"],
              ["es", "Español"],
              ["pt", "Português"],
            ].map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                style={{
                  minHeight: 44,
                  borderRadius: 13,
                  border:
                    language === code
                      ? "2px solid #ffffff"
                      : "1px solid rgba(255,255,255,0.30)",
                  background:
                    language === code
                      ? "rgba(255,255,255,0.20)"
                      : "rgba(255,255,255,0.08)",
                  color: "#ffffff",
                  fontWeight: 850,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {submitted ? (
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #dbeafe",
              borderRadius: 24,
              padding: "34px 20px",
              textAlign: "center",
              boxShadow: "0 16px 36px rgba(15,23,42,0.07)",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 10 }}>✓</div>
            <h1 style={{ margin: 0, color: "#0f4c81", fontSize: 25 }}>{t.thanksTitle}</h1>
            <p style={{ color: "#64748b", lineHeight: 1.65, margin: "10px auto 22px", maxWidth: 420 }}>
              {t.thanksBody}
            </p>
            <button
              type="button"
              onClick={resetForm}
              style={{
                width: "100%",
                minHeight: 50,
                border: "none",
                borderRadius: 15,
                background: "#1769aa",
                color: "#ffffff",
                fontSize: 15,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {t.another}
            </button>
          </section>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            <section style={{ padding: "4px 4px 2px" }}>
              <h1
                style={{
                  margin: "8px 0 7px",
                  fontSize: 25,
                  lineHeight: 1.15,
                  color: "#0f172a",
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                }}
              >
                {t.title}
              </h1>
              <p style={{ margin: 0, color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
                {t.intro}
              </p>
            </section>

            <QuestionCard label={t.serviceDate}>
              <input
                type="date"
                min={MIN_FEEDBACK_DATE}
                max={today}
                value={serviceDate}
                onChange={(event) => setServiceDate(event.target.value)}
                required
                style={inputStyle()}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                {t.serviceDateHelp}
              </div>
            </QuestionCard>

            <QuestionCard label={t.passengerName}>
              <input
                value={passengerName}
                maxLength={120}
                onChange={(event) => setPassengerName(event.target.value)}
                placeholder={t.passengerNamePlaceholder}
                autoComplete="name"
                style={inputStyle()}
              />
            </QuestionCard>

            <QuestionCard label={t.flightNumber}>
              <input
                value={flightNumber}
                maxLength={20}
                onChange={(event) => setFlightNumber(event.target.value.toUpperCase())}
                placeholder={t.flightNumberPlaceholder}
                autoCapitalize="characters"
                style={inputStyle()}
              />
            </QuestionCard>

            <QuestionCard label={t.pnr}>
              <input
                value={pnr}
                maxLength={20}
                onChange={(event) => setPnr(event.target.value.toUpperCase().replace(/\s+/g, ""))}
                placeholder={t.pnrPlaceholder}
                autoCapitalize="characters"
                autoCorrect="off"
                style={inputStyle()}
              />
            </QuestionCard>

            <QuestionCard label={t.employeeFirstName}>
              <input
                value={employeeFirstName}
                maxLength={60}
                onChange={(event) => setEmployeeFirstName(event.target.value)}
                placeholder={t.employeeFirstNamePlaceholder}
                autoCapitalize="words"
                style={inputStyle()}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                {t.employeeHelp}
              </div>
            </QuestionCard>

            <QuestionCard label={t.rating}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: 7,
                }}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={t.ratingLabels[value - 1]}
                    title={t.ratingLabels[value - 1]}
                    onClick={() => setRating(value)}
                    style={{
                      minHeight: 54,
                      borderRadius: 14,
                      border: rating === value ? "2px solid #f59e0b" : "1px solid #e2e8f0",
                      background: rating >= value ? "#fffbeb" : "#ffffff",
                      fontSize: 27,
                      lineHeight: 1,
                      cursor: "pointer",
                    }}
                  >
                    {rating >= value ? "★" : "☆"}
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <div style={{ textAlign: "center", marginTop: 8, color: "#64748b", fontSize: 12 }}>
                  {t.ratingLabels[rating - 1]}
                </div>
              )}
            </QuestionCard>

            <QuestionCard label={t.courteous}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                {[
                  ["excellent", t.excellent],
                  ["good", t.good],
                  ["fair", t.fair],
                  ["poor", t.poor],
                ].map(([value, label]) => (
                  <ChoiceButton
                    key={value}
                    selected={courteous === value}
                    onClick={() => setCourteous(value)}
                  >
                    {label}
                  </ChoiceButton>
                ))}
              </div>
            </QuestionCard>

            <QuestionCard label={t.assistance}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {[
                  ["yes", t.yes],
                  ["partially", t.partially],
                  ["no", t.no],
                ].map(([value, label]) => (
                  <ChoiceButton
                    key={value}
                    selected={assistance === value}
                    onClick={() => setAssistance(value)}
                  >
                    {label}
                  </ChoiceButton>
                ))}
              </div>
            </QuestionCard>

            <QuestionCard label={t.recommend}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                {[
                  ["yes", t.yes],
                  ["no", t.no],
                ].map(([value, label]) => (
                  <ChoiceButton
                    key={value}
                    selected={recommend === value}
                    onClick={() => setRecommend(value)}
                  >
                    {label}
                  </ChoiceButton>
                ))}
              </div>
            </QuestionCard>

            <QuestionCard label={t.comments}>
              <textarea
                rows={4}
                maxLength={1200}
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                placeholder={t.commentsPlaceholder}
                style={{
                  ...inputStyle(),
                  minHeight: 112,
                  resize: "vertical",
                  lineHeight: 1.5,
                }}
              />
            </QuestionCard>

            <QuestionCard label={t.contactQuestion}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <ChoiceButton
                  selected={contactRequested === "yes"}
                  onClick={() => setContactRequested("yes")}
                >
                  {t.yes}
                </ChoiceButton>
                <ChoiceButton
                  selected={contactRequested === "no"}
                  onClick={() => {
                    setContactRequested("no");
                    setContactEmail("");
                    setContactPhone("");
                  }}
                >
                  {t.no}
                </ChoiceButton>
              </div>

              {contactRequested === "yes" && (
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 10,
                    paddingTop: 12,
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                    {t.contactHelp}
                  </div>

                  <div>
                    <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 800, color: "#475569" }}>
                      {t.email}
                    </div>
                    <input
                      type="email"
                      value={contactEmail}
                      maxLength={160}
                      onChange={(event) => setContactEmail(event.target.value)}
                      placeholder={t.emailPlaceholder}
                      autoComplete="email"
                      inputMode="email"
                      style={inputStyle()}
                    />
                  </div>

                  <div>
                    <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 800, color: "#475569" }}>
                      {t.phone}
                    </div>
                    <input
                      type="tel"
                      value={contactPhone}
                      maxLength={40}
                      onChange={(event) => setContactPhone(event.target.value)}
                      placeholder={t.phonePlaceholder}
                      autoComplete="tel"
                      inputMode="tel"
                      style={inputStyle()}
                    />
                  </div>
                </div>
              )}
            </QuestionCard>

            {error && (
              <div
                role="alert"
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  color: "#9f1239",
                  borderRadius: 15,
                  padding: "12px 14px",
                  fontSize: 13,
                  fontWeight: 750,
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%",
                minHeight: 54,
                border: "none",
                borderRadius: 16,
                background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 62%, #4da8df 100%)",
                color: "#ffffff",
                fontSize: 16,
                fontWeight: 900,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.72 : 1,
                boxShadow: "0 14px 28px rgba(23,105,170,0.22)",
              }}
            >
              {submitting ? t.submitting : t.submit}
            </button>

            <div
              style={{
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 11,
                lineHeight: 1.5,
                padding: "4px 12px 10px",
              }}
            >
              {t.privacy}
            </div>
          </form>
        )}
      </div>
    </main>
  );
