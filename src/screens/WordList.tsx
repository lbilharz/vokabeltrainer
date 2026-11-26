import { getCard, isMastered } from "@shared/srs";
import type { Item, Progress } from "@shared/types";
import { Icon } from "../components/Icon";
import type { SetView } from "../data/sets";
import { speak } from "../lib/audio";

interface Props {
  set: SetView;
  progress: Progress;
  rate: number;
  onBack: () => void;
}

export function WordList({ set, progress, rate, onBack }: Props) {
  const groups: { c: string; items: Item[] }[] = [];
  for (const item of set.items) {
    const group = groups.find((g) => g.c === item.c);
    if (group) group.items.push(item);
    else groups.push({ c: item.c, items: [item] });
  }

  return (
    <main className="screen list">
      <header className="topbar left">
        <button className="icon-btn" aria-label="Zurück zum Lernpfad" onClick={onBack}>
          <Icon name="chevronLeft" size={26} stroke={2.6} />
        </button>
        <h1>{set.label}</h1>
      </header>
      {groups.map((group) => (
        <section key={group.c} className="list-group">
          <h2>{group.c || set.label}</h2>
          <ul>
            {group.items.map((item) => {
              const card = getCard(progress, item.id, 0);
              const status = !card.seen ? "neu" : isMastered(card) ? "sitzt" : "in Arbeit";
              return (
                <li key={item.id}>
                  <div className="list-text">
                    <div className="list-fr" lang={item.lang}>
                      {item.fr}
                    </div>
                    <div className="list-de">{item.de}</div>
                    {item.n && <div className="list-note">{item.n}</div>}
                    <div className={`list-status ${card.seen ? (isMastered(card) ? "good" : "busy") : ""}`}>{status}</div>
                  </div>
                  {!item.cards && (
                    <button className="speak-btn small" aria-label={`${item.fr} anhören`} onClick={() => speak(item.fr, item.lang, rate)}>
                      <Icon name="speaker" size={22} stroke={2.2} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
