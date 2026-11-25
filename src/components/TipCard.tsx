import { useState } from "react";
import "../onboarding.css";
import { Icon } from "./Icon";

interface Props {
  userId: string;
  onOpenSettings: () => void;
}

const key = (userId: string) => `travok_tips:${userId}`;

/** Ohne Speicher (privater Modus) zeigt sich die Karte einfach wieder. */
function wasDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === "1";
  } catch {
    return false;
  }
}

/** Kleine Starthilfe oben auf dem Home. Bleibt weg, sobald sie geschlossen wurde. */
export function TipCard({ userId, onOpenSettings }: Props) {
  const [hidden, setHidden] = useState(() => wasDismissed(userId));
  if (hidden) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(key(userId), "1");
    } catch {
      // Ohne Speicher bleibt es beim Schließen für diese Sitzung.
    }
  };

  return (
    <aside className="tip-card" aria-label="Tipps">
      <p>
        <strong>Heute:</strong> Die App wählt jeden Tag die Karten für dich aus.
      </p>
      <p>
        <strong>Stationen:</strong> Deine Lektion hat mehrere Stationen. Eine nach der anderen wird frei.
      </p>
      <p>Eine tägliche Erinnerung schaltest du in den Einstellungen ein.</p>
      <button className="text-btn" onClick={onOpenSettings}>
        Erinnerung einrichten
      </button>
      <button className="icon-btn" aria-label="Tipps schließen" onClick={close}>
        <Icon name="x" size={20} stroke={2.6} />
      </button>
    </aside>
  );
}
