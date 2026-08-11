interface AsyncProcessStatusProps {
  eyebrow: string;
  title: string;
  detail: string;
  steps: string[];
  activeStep: number;
}

export function AsyncProcessStatus({
  eyebrow,
  title,
  detail,
  steps,
  activeStep,
}: AsyncProcessStatusProps) {
  return (
    <div className="async-process" role="status" aria-live="polite" aria-atomic="true">
      <div className="async-process__copy">
        <span>{eyebrow}</span>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <div className="async-process__track" aria-hidden="true">
        <span />
      </div>
      <ol className="async-process__steps" aria-label="处理阶段">
        {steps.map((step, index) => (
          <li key={step} data-active={index === activeStep}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
