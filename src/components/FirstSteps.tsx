import "../onboarding.css";
import { isInstalled } from "../lib/install";
import { Icon } from "./Icon";

interface Props {
  onAddSet: () => void;
  onAddSample: () => void;
}

/** Geführter Start für ein Konto ohne Lektion. */
export function FirstSteps({ onAddSet, onAddSample }: Props) {
  return (
    <section className="first-steps">
      <div>
        <h2>Willkommen!</h2>
        <p className="lead">In drei Schritten übst du deine Vokabeln.</p>
      </div>

      <ol className="steps">
        <li>
          <span className="step-num" aria-hidden="true">
            1
          </span>
          <div className="step-body">
            <h3>Vokabeln fotografieren</h3>
            <p>Mach ein Foto von der Vokabelseite in deinem Buch.</p>
            <ul className="photo-tips">
              <li>Die ganze Seite ist im Bild.</li>
              <li>Gerade von oben, nicht schräg.</li>
              <li>Helles Licht, kein Schatten.</li>
            </ul>
            <button className="btn primary" onClick={onAddSet}>
              <Icon name="camera" size={24} stroke={2.2} />
              Vokabeln fotografieren
            </button>
          </div>
        </li>
        <li>
          <span className="step-num" aria-hidden="true">
            2
          </span>
          <div className="step-body">
            <h3>Wörter prüfen</h3>
            <p>Die App liest die Wörter. Du schaust, ob alles stimmt.</p>
          </div>
        </li>
        <li>
          <span className="step-num" aria-hidden="true">
            3
          </span>
          <div className="step-body">
            <h3>Jeden Tag ein paar Minuten üben</h3>
            <p>Die App merkt sich, was du schon kannst.</p>
          </div>
        </li>
      </ol>

      <button className="text-btn center" onClick={onAddSample}>
        Erst ohne Buch ausprobieren
      </button>

      {!isInstalled() && (
        <p className="install-hint">
          Tipp für das iPhone: Tippe auf Teilen und dann auf "Zum Home-Bildschirm". Erinnerungen gehen nur von dort.
        </p>
      )}
    </section>
  );
}
