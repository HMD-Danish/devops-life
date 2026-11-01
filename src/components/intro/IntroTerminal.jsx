/** The scripted mini terminal that types itself during the intro. */
const LINES = [
  { prompt: "$", text: "git push origin main" },
  { mark: "✔", text: "build passed" },
  { prompt: "$", text: "kubectl rollout status deployment/checkout" },
  { mark: "✔", text: "deployment successfully rolled out" },
  { prompt: "$", text: 'welcome --to "DevOps Life"' },
];

const START = 0.48;
const STEP = 0.1;

export default function IntroTerminal() {
  return (
    <div className="intro-terminal glass-panel w-full max-w-[520px] px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="intro-dot" />
        <span className="intro-dot" />
        <span className="intro-dot" />
        <span className="terminal-font ml-1.5 text-[10.5px] text-label-secondary">devops-life — zsh</span>
      </div>
      <div className="terminal-font space-y-1 text-[11.5px] leading-relaxed sm:text-[13px]">
        {LINES.map((line, index) => (
          <p key={line.text} className="intro-line break-words" style={{ animationDelay: `${START + index * STEP}s` }}>
            {line.prompt ? (
              <span className="intro-prompt">{line.prompt} </span>
            ) : (
              <span className="intro-ok">{line.mark} </span>
            )}
            <span className="intro-term-text">{line.text}</span>
          </p>
        ))}
      </div>
    </div>
  );
}