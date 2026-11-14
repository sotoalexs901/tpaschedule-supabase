import React from "react";
import "./SeasonalCelebrationBanner.css";

// Dates are based on the Tampa station calendar, not the device time zone.
// The official installed PWA icon is never modified.
export function getSeasonalCelebration(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const parts = Object.fromEntries(date.map(({ type, value }) => [type, value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (day >= "2026-11-01" && day < "2026-12-01") return {
    name: "birthday", emojis: ["🥳", "🎂", "🎉"],
    title: "Happy 1st Birthday, AeroStation Hub! 🎈",
    message: "One year of smarter operations. Thank you to our amazing team!",
  };
  if (day >= "2026-12-01" && day < "2026-12-26") return {
    name: "christmas", emojis: ["🎅", "🎄", "🎁"],
    title: "Merry Christmas! ❄️",
    message: "Wishing our entire AeroStation Hub team a joyful and safe holiday season!",
  };
  if (day >= "2026-12-26" && day < "2027-02-16") return {
    name: "newyear", emojis: ["🥳", "🎆", "🎉"],
    title: "Happy New Year 2027! ✨",
    message: "A new year of teamwork, safety and smarter operations!",
  };
  return null;
}

export default function SeasonalCelebrationBanner() {
  const celebration = getSeasonalCelebration();
  if (!celebration) return null;
  return (
    <section className={`aerohub-seasonal-banner aerohub-seasonal-${celebration.name}`} aria-label={celebration.title}>
      <div className="aerohub-seasonal-icons" aria-hidden="true">
        {celebration.emojis.map((emoji, i) => <span key={i}>{emoji}</span>)}
      </div>
      <div className="aerohub-seasonal-message">
        <strong>{celebration.title}</strong>
        <p>{celebration.message}</p>
      </div>
      <div className="aerohub-seasonal-sparkles" aria-hidden="true">✦ ✨ ✦</div>
    </section>
  );
}
