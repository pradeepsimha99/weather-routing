import { useId, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import type { PlaceSuggestion } from "../api/places";
import { useLocationSuggestions } from "../hooks/useLocationSuggestions";
import type { SuggestionStatus } from "../hooks/useLocationSuggestions";
import { FieldMessage } from "./FieldMessage";

interface LocationInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint: string;
  error?: string;
}

function statusText(status: SuggestionStatus): string {
  if (status === "loading") {
    return "Searching…";
  }
  if (status === "error") {
    return "Suggestions are unavailable right now. You can still type the place name.";
  }
  return "No matching places. You can still type any address and submit.";
}

export function LocationInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
}: LocationInputProps) {
  const listId = useId();
  const messageId = `${id}-message`;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { status, suggestions } = useLocationSuggestions(value, isOpen);

  const showPanel = isOpen && status !== "idle";
  const showList = showPanel && suggestions.length > 0;
  // Results can change under the user; never point past the end of the list.
  const safeIndex = activeIndex < suggestions.length ? activeIndex : -1;

  const select = (suggestion: PlaceSuggestion) => {
    onChange(suggestion.label);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
    setIsOpen(true);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (showPanel) {
        event.preventDefault();
        setIsOpen(false);
      }
      return;
    }
    if (!showList) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && safeIndex >= 0) {
      event.preventDefault(); // pick the suggestion instead of submitting the form
      select(suggestions[safeIndex]);
    }
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="combobox__control">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList && safeIndex >= 0 ? `${listId}-option-${safeIndex}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={messageId}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setIsOpen(false)}
        />

        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="suggestions"
            aria-label={`${label} suggestions`}
            onMouseDown={(event) => event.preventDefault()} // keep focus in the input
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === safeIndex}
                className="suggestions__option"
                onClick={() => select(suggestion)}
              >
                {suggestion.label}
              </li>
            ))}
          </ul>
        )}

        {showPanel && suggestions.length === 0 && (
          <div className="suggestions suggestions__status" role="status">
            {statusText(status)}
          </div>
        )}
      </div>
      <FieldMessage id={messageId} hint={hint} error={error} />
    </div>
  );
}