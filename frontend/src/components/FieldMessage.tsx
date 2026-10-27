interface FieldMessageProps {
  id: string;
  hint: string;
  error?: string;
}

export function FieldMessage({ id, hint, error }: FieldMessageProps) {
  if (error) {
    return (
      <span id={id} className="field__error" role="alert">
        {error}
      </span>
    );
  }
  return (
    <span id={id} className="field__hint">
      {hint}
    </span>
  );
}